-- Atomic task outcome, optional follow-up task, checklist, follow-up record and notifications.
-- The operation is one transaction and does not touch financial balances.
create table if not exists private.task_outcome_requests (
  organization_id uuid not null,
  request_id uuid not null,
  task_id text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, request_id)
);
revoke all on private.task_outcome_requests from public, anon;
grant usage on schema private to authenticated;
grant select, insert, update on private.task_outcome_requests to authenticated;

create or replace function private.can_assign_task(
  target_org uuid,
  target_assignee_id text,
  required_action text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.auth_user_id = (select auth.uid())
      and m.active
      and (
        m.role = 'admin'
        or (
          required_action = 'followup'
          and m.role = 'field_officer'
          and target_assignee_id = m.app_user_id
        )
        or (
          exists (
            select 1 from public.role_permissions rp
            where rp.organization_id = m.organization_id
              and rp.role_key = m.role
              and rp.permission_key = 'tasks.' || required_action
              and rp.granted
          )
          and (m.role <> 'field_officer' or target_assignee_id = m.app_user_id)
        )
      )
  );
$$;

drop policy if exists tasks_scoped_insert on public.tasks;
create policy tasks_scoped_insert on public.tasks
for insert to authenticated
with check (
  private.can_assign_task(organization_id, assignee_id, 'create')
  or private.can_assign_task(organization_id, assignee_id, 'followup')
);

create or replace function public.record_task_outcome_bundle(
  p_organization_id uuid,
  p_task_id text,
  p_request_id uuid,
  p_outcome text,
  p_reason text default null,
  p_notes text default null,
  p_proof_url text default null,
  p_follow_up jsonb default null,
  p_event jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_task public.tasks%rowtype;
  v_app_user_id text;
  v_actor_name text;
  v_follow_id text;
  v_follow_assignee text;
  v_follow_name text;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_inserted integer;
  v_chain jsonb;
  v_elapsed integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_request_id is null or p_organization_id is null or p_task_id is null then
    raise exception using errcode = '22023', message = 'Organization, task and idempotency key are required';
  end if;
  if p_outcome not in ('completed','partially_completed','not_completed','unable_to_execute','needs_followup') then
    raise exception using errcode = '22023', message = 'Unsupported task outcome';
  end if;
  if p_outcome <> 'completed' and coalesce(nullif(btrim(p_reason),''),'') = '' then
    raise exception using errcode = '22023', message = 'A reason is required for an incomplete outcome';
  end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then
    raise exception using errcode = '42501', message = 'Task edit permission required';
  end if;

  insert into private.task_outcome_requests(organization_id,request_id,task_id)
  values(p_organization_id,p_request_id,p_task_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select result into v_result from private.task_outcome_requests
    where organization_id=p_organization_id and request_id=p_request_id and task_id=p_task_id;
    if v_result is null then
      raise exception using errcode = '40001', message = 'The same task outcome request is still being processed';
    end if;
    return v_result;
  end if;

  select m.app_user_id,u.name
    into v_app_user_id,v_actor_name
  from public.organization_members m
  left join public.app_users u
    on u.organization_id=m.organization_id and u.id=m.app_user_id
  where m.organization_id=p_organization_id
    and m.auth_user_id=auth.uid() and m.active
  limit 1;

  select * into v_task from public.tasks
  where organization_id=p_organization_id and id=p_task_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  if v_task.task_type_category in ('field','visit') then
    if p_event is null or jsonb_typeof(p_event) <> 'object'
       or nullif(p_event->>'clientEventId','') is null
       or nullif(p_event->>'latitude','') is null
       or nullif(p_event->>'longitude','') is null
       or nullif(p_event->>'accuracyMeters','') is null then
      raise exception using errcode = '22023', message = 'A fresh GPS event is required to finish a field task';
    end if;
    if (p_event->>'latitude')::double precision not between -90 and 90
       or (p_event->>'longitude')::double precision not between -180 and 180
       or (p_event->>'accuracyMeters')::double precision < 0 then
      raise exception using errcode = '22023', message = 'Invalid GPS coordinates';
    end if;
    insert into public.task_events(
      organization_id,task_id,standing_account_id,actor_auth_user_id,event_type,event_label,
      occurred_at,latitude,longitude,accuracy_meters,location_status,client_event_id,details
    ) values (
      p_organization_id,p_task_id,v_task.standing_account_id,auth.uid(),
      case when v_task.task_type_category='visit' then 'visit_completed' else 'task_completed' end,
      coalesce(p_event->>'eventLabel','إنهاء المهمة'),
      v_now,(p_event->>'latitude')::double precision,(p_event->>'longitude')::double precision,
      (p_event->>'accuracyMeters')::double precision,'captured',(p_event->>'clientEventId')::uuid,
      jsonb_build_object('outcome',p_outcome,'reason',p_reason,'notes',p_notes,'proofUrl',p_proof_url)
    )
    on conflict (organization_id,client_event_id) do nothing;
  elsif p_event is not null then
    raise exception using errcode = '22023', message = 'GPS event is only valid for field or visit tasks';
  end if;

  if v_task.is_timer_running and v_task.timer_started_at is not null then
    v_elapsed := greatest(1,round(extract(epoch from (v_now-v_task.timer_started_at))/60)::integer);
  end if;

  update public.tasks set
    status = case when p_outcome='completed' then 'pending_approval' else 'deferred' end,
    outcome=p_outcome,
    outcome_reason=nullif(btrim(p_reason),''),
    outcome_notes=nullif(btrim(p_notes),''),
    outcome_submitted_at=v_now,
    proof_attachment_url=coalesce(nullif(p_proof_url,''),proof_attachment_url),
    actual_end_time=v_now,
    time_spent_minutes=time_spent_minutes+v_elapsed,
    is_paused=false,
    paused_at=null,
    pause_reason=null,
    is_timer_running=false,
    timer_started_at=null,
    updated_at=v_now
  where organization_id=p_organization_id and id=p_task_id
  returning * into v_task;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-outcome-'||p_request_id::text,p_organization_id,p_task_id,
    'تسجيل نتيجة المهمة: '||p_outcome,coalesce(v_actor_name,'مستخدم النظام'),
    concat_ws(' | ',nullif(p_reason,''),nullif(p_notes,'')));

  if p_follow_up is not null then
    v_follow_id := nullif(p_follow_up->>'id','');
    v_follow_assignee := coalesce(nullif(p_follow_up->>'assigneeId',''),v_task.assignee_id);
    if v_follow_id is null or not exists (
      select 1 from public.app_users u
      where u.organization_id=p_organization_id and u.id=v_follow_assignee and u.active
    ) then
      raise exception using errcode = '22023', message = 'Follow-up task id and active assignee are required';
    end if;
    if not (
      private.can_assign_task(p_organization_id,v_follow_assignee,'create')
      or private.can_assign_task(p_organization_id,v_follow_assignee,'followup')
    ) then
      raise exception using errcode = '42501', message = 'Not allowed to create this follow-up assignment';
    end if;
    select name into v_follow_name from public.app_users
    where organization_id=p_organization_id and id=v_follow_assignee;

    insert into public.tasks(
      id,organization_id,title,description,priority,status,assignee_id,assignee_name,
      assignee_avatar,supervisor_id,supervisor_name,creator_id,creator_name,supervisors,
      due_date,start_date,due_time,location,location_required,maps_url,geo_coordinates,
      category,task_type,task_type_category,client_name,client_contact,client_phone,
      proof_required,budget,spent_amount,tags,fund_id,task_fund_amount,task_fund_spent,
      task_fund_remaining,notes,parent_task_id,standing_account_id,task_chain
    ) values (
      v_follow_id,p_organization_id,
      coalesce(nullif(p_follow_up->>'title',''),'متابعة: '||v_task.title),
      concat('مهمة متابعة للمهمة السابقة: ',v_task.title,'. السبب: ',coalesce(p_reason,'متابعة')),
      v_task.priority,'scheduled',v_follow_assignee,coalesce(v_follow_name,''),
      v_task.assignee_avatar,v_task.supervisor_id,v_task.supervisor_name,v_app_user_id,
      coalesce(v_actor_name,''),v_task.supervisors,
      nullif(p_follow_up->>'dueDate','')::date,current_date,
      nullif(p_follow_up->>'dueTime',''),v_task.location,v_task.location_required,
      v_task.maps_url,v_task.geo_coordinates,v_task.category,'متابعة لاحقة',
      v_task.task_type_category,v_task.client_name,v_task.client_contact,v_task.client_phone,
      v_task.proof_required,0,0, v_task.tags || array['سلسلة متابعة'],
      v_task.fund_id,null,0,null,
      nullif(p_follow_up->>'notes',''),p_task_id,v_task.standing_account_id,'[]'::jsonb
    );

    insert into public.task_checklist_items(id,organization_id,task_id,text,completed,sort_order)
    values
      ('chk-'||v_follow_id||'-1',p_organization_id,v_follow_id,
       'استكمال متطلبات المعالجة: '||coalesce(p_reason,'متابعة الإجراء'),false,0),
      ('chk-'||v_follow_id||'-2',p_organization_id,v_follow_id,
       'فحص رضا العميل وتوثيق الإنجاز',false,1);

    insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
    values('hist-'||v_follow_id,p_organization_id,v_follow_id,
      'إنشاء مهمة متابعة من المهمة السابقة',coalesce(v_actor_name,'مستخدم النظام'),p_task_id);

    insert into public.follow_ups(
      id,organization_id,task_id,title,urgency,assigned_to,scheduled_date,status,notes
    ) values (
      'flw-'||v_follow_id,p_organization_id,p_task_id,
      coalesce(nullif(p_follow_up->>'title',''),'متابعة: '||v_task.title),
      'high',v_follow_assignee,nullif(p_follow_up->>'dueDate','')::date,'pending',
      concat_ws(' | ',nullif(p_reason,''),nullif(p_follow_up->>'notes',''))
    );

    v_chain := coalesce(v_task.task_chain,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id',v_follow_id,'title',coalesce(nullif(p_follow_up->>'title',''),'متابعة: '||v_task.title),
      'status','scheduled','date',p_follow_up->>'dueDate','assigneeName',coalesce(v_follow_name,'')
    ));
    update public.tasks set chain_follow_up_task_id=v_follow_id,task_chain=v_chain,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id;

    insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
    values('notif-'||v_follow_id,p_organization_id,v_follow_assignee,
      'مهمة متابعة جديدة متصلة','تم تكليفك بمهمة متابعة: '||coalesce(nullif(p_follow_up->>'title',''),'متابعة: '||v_task.title),
      'warning',false,'daily');
  end if;

  insert into public.audit_logs(
    id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details
  ) values (
    'aud-outcome-'||p_request_id::text,p_organization_id,v_app_user_id,
    coalesce(v_actor_name,'مستخدم النظام'),
    (select role from public.organization_members where organization_id=p_organization_id and auth_user_id=auth.uid() and active limit 1),
    'تسجيل نتيجة مهمة','update','task',p_task_id,
    concat_ws(' | ',p_outcome,nullif(p_reason,''),nullif(p_notes,''))
  );

  v_result := jsonb_build_object('task_id',p_task_id,'follow_up_task_id',v_follow_id,'status',v_task.status);
  update private.task_outcome_requests set result=v_result
  where organization_id=p_organization_id and request_id=p_request_id;
  return v_result;
end;
$$;

revoke all on function public.record_task_outcome_bundle(uuid,text,uuid,text,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.record_task_outcome_bundle(uuid,text,uuid,text,text,text,text,jsonb,jsonb) to authenticated;
