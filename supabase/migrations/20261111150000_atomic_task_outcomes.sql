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

drop policy if exists task_events_actor_insert on public.task_events;
create policy task_events_actor_insert on public.task_events
for insert to authenticated
with check (
  actor_auth_user_id = (select auth.uid())
  and private.is_org_member(organization_id)
  and private.can_access_task(organization_id, task_id, 'edit')
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

  insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
  values(
    'notif-outcome-'||p_request_id::text,
    p_organization_id,
    v_task.creator_id,
    case when p_outcome='completed' then 'مهمة جاهزة للاعتماد' else 'مهمة تتطلب المتابعة' end,
    coalesce(v_actor_name,'مستخدم النظام')||' سجل نتيجة المهمة "'||v_task.title||'": '||p_outcome,
    case when p_outcome='completed' then 'success' else 'alert' end,
    false,
    'daily'
  );

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


-- Extend the original atomic create RPC now that task_assignees exists.
create or replace function public.create_task_bundle(
  p_organization_id uuid,
  p_task jsonb,
  p_checklist jsonb default '[]'::jsonb,
  p_steps jsonb default '[]'::jsonb,
  p_subtask jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_app_user_id text;
  v_role text;
  v_task_id text;
  v_task public.tasks%rowtype;
  v_item jsonb;
  v_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_organization_id is null or jsonb_typeof(p_task) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid task payload';
  end if;
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_steps, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Checklist and steps must be arrays';
  end if;

  select m.app_user_id, m.role
    into v_app_user_id, v_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.auth_user_id = v_auth_user_id
    and m.active
  limit 1;

  if not found or v_app_user_id is null then
    raise exception using errcode = '42501', message = 'Active operational membership required';
  end if;

  if v_role <> 'admin' and not exists (
    select 1 from public.role_permissions rp
    where rp.organization_id = p_organization_id
      and rp.role_key = v_role
      and rp.permission_key = 'tasks.create'
      and rp.granted
  ) then
    raise exception using errcode = '42501', message = 'Missing tasks.create permission';
  end if;

  v_task_id := nullif(p_task->>'id', '');
  if v_task_id is null or length(v_task_id) > 120
     or coalesce(nullif(trim(p_task->>'title'), ''), '') = ''
     or nullif(p_task->>'assigneeId', '') is null then
    raise exception using errcode = '22023', message = 'Task id, title and assignee are required';
  end if;

  if v_role = 'field_officer' and p_task->>'assigneeId' <> v_app_user_id then
    raise exception using errcode = '42501', message = 'Field officers may only assign tasks to themselves';
  end if;

  if not exists (
    select 1 from public.app_users u
    where u.organization_id = p_organization_id
      and u.id = p_task->>'assigneeId'
      and u.active
  ) then
    raise exception using errcode = '23503', message = 'Active assignee not found in this organization';
  end if;

  if nullif(p_task->>'fundId', '') is not null and not exists (
    select 1 from public.funds f
    where f.organization_id = p_organization_id
      and f.id = p_task->>'fundId'
  ) then
    raise exception using errcode = '23503', message = 'Linked fund not found in this organization';
  end if;

  if nullif(p_task->>'parentTaskId', '') is not null and not exists (
    select 1 from public.tasks t
    where t.organization_id = p_organization_id
      and t.id = p_task->>'parentTaskId'
  ) then
    raise exception using errcode = '23503', message = 'Parent task not found in this organization';
  end if;

  insert into public.tasks (
    id, organization_id, title, description, priority, status,
    assignee_id, assignee_name, assignee_avatar, supervisor_id, supervisor_name,
    creator_id, creator_name, supervisors, due_date, start_date, due_time,
    location, location_required, maps_url, geo_coordinates, category, task_type,
    task_type_category, client_name, client_contact, client_phone, proof_required,
    proof_attachment_url, budget, spent_amount, tags, fund_id, task_fund_amount,
    task_fund_spent, task_fund_remaining, notes, parent_task_id, standing_account_id
  ) values (
    v_task_id, p_organization_id, trim(p_task->>'title'),
    coalesce(p_task->>'description',''), coalesce(p_task->>'priority','medium'),
    coalesce(p_task->>'status','scheduled'), p_task->>'assigneeId',
    coalesce(p_task->>'assigneeName',''), nullif(p_task->>'assigneeAvatar',''),
    nullif(p_task->>'supervisorId',''), nullif(p_task->>'supervisorName',''),
    v_app_user_id, coalesce((select u.name from public.app_users u where u.organization_id=p_organization_id and u.id=v_app_user_id),''),
    coalesce(p_task->'supervisors','[]'::jsonb),
    nullif(p_task->>'dueDate','')::date, nullif(p_task->>'startDate','')::date,
    nullif(p_task->>'dueTime','')::time, coalesce(p_task->>'location',''),
    coalesce((p_task->>'locationRequired')::boolean,false),
    nullif(p_task->>'mapsUrl',''), p_task->'geoCoordinates',
    coalesce(p_task->>'category',''), nullif(p_task->>'taskType',''),
    nullif(p_task->>'taskTypeCategory',''), nullif(p_task->>'clientName',''),
    nullif(p_task->>'clientContact',''), nullif(p_task->>'clientPhone',''),
    nullif(p_task->>'proofRequired',''), nullif(p_task->>'proofAttachmentUrl',''),
    greatest(coalesce((p_task->>'budget')::numeric,0),0), 0,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_task->'tags','[]'::jsonb))),'{}'::text[]),
    nullif(p_task->>'fundId',''), nullif(p_task->>'taskFundAmount','')::numeric,
    0, nullif(p_task->>'taskFundAmount','')::numeric,
    nullif(p_task->>'notes',''), nullif(p_task->>'parentTaskId',''),
    nullif(p_task->>'standingAccountId','')
  )
  returning * into v_task;

  -- Keep every selected executor as a normalized relation, not a name in the description.
  for v_item in
    select value from jsonb_array_elements(
      coalesce(p_task->'assigneeIds', jsonb_build_array(to_jsonb(p_task->>'assigneeId')))
    )
  loop
    if jsonb_typeof(v_item) <> 'string' or nullif(v_item #>> '{}','') is null then
      raise exception using errcode = '22023', message = 'Invalid task assignee id';
    end if;
    if not exists (
      select 1 from public.app_users u
      where u.organization_id = p_organization_id
        and u.id = v_item #>> '{}'
        and u.active
    ) then
      raise exception using errcode = '23503', message = 'A selected task assignee is not active in this organization';
    end if;
    insert into public.task_assignees(id,organization_id,task_id,app_user_id,assigned_by,is_primary)
    values(
      'asg-' || v_task_id || '-' || (v_item #>> '{}'),
      p_organization_id,v_task_id,v_item #>> '{}',v_app_user_id,
      (v_item #>> '{}') = p_task->>'assigneeId'
    )
    on conflict (organization_id,task_id,app_user_id)
    do update set is_primary = excluded.is_primary, assigned_by = excluded.assigned_by;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_checklist,'[]'::jsonb))
  loop
    if coalesce(nullif(v_item->>'id',''), '') = '' or coalesce(nullif(trim(v_item->>'text'),''),'') = '' then
      raise exception using errcode = '22023', message = 'Invalid checklist item';
    end if;
    insert into public.task_checklist_items(id,organization_id,task_id,text,completed,sort_order)
    values(v_item->>'id',p_organization_id,v_task_id,trim(v_item->>'text'),false,v_count);
    v_count := v_count + 1;
  end loop;

  v_count := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_steps,'[]'::jsonb))
  loop
    if coalesce(nullif(v_item->>'id',''), '') = '' or coalesce(nullif(trim(v_item->>'title'),''),'') = '' then
      raise exception using errcode = '22023', message = 'Invalid task step';
    end if;
    insert into public.task_steps(id,organization_id,task_id,title,status,planned_time,notes,sort_order)
    values(v_item->>'id',p_organization_id,v_task_id,trim(v_item->>'title'),
      coalesce(v_item->>'status','pending'),nullif(v_item->>'plannedTime',''),
      nullif(v_item->>'notes',''),coalesce((v_item->>'order')::integer,v_count));
    v_count := v_count + 1;
  end loop;

  if p_subtask is not null then
    if nullif(p_task->>'parentTaskId','') is null then
      raise exception using errcode = '22023', message = 'Parent task id required for subtask link';
    end if;
    insert into public.task_subtasks(
      id,organization_id,task_id,title,assignee_id,assignee_name,status,
      requires_approval,is_approved,approved_by_manager,due_date,notes
    ) values (
      coalesce(nullif(p_subtask->>'id',''), 'sub-' || v_task_id),
      p_organization_id,p_task->>'parentTaskId',trim(p_task->>'title'),
      p_task->>'assigneeId',coalesce(p_task->>'assigneeName',''),
      coalesce(p_task->>'status','scheduled'),
      coalesce((p_subtask->>'requiresApproval')::boolean,false),false,false,
      nullif(p_task->>'dueDate','')::date,nullif(p_subtask->>'notes','')
    );
  end if;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-' || v_task_id,p_organization_id,v_task_id,
    'إنشاء المهمة وتكليف ' || coalesce(p_task->>'assigneeName',''),
    coalesce((select u.name from public.app_users u where u.organization_id=p_organization_id and u.id=v_app_user_id),''),
    'تم إنشاء المهمة مع حفظ خطواتها وقائمة الفحص في معاملة واحدة');

  return jsonb_build_object('task',to_jsonb(v_task),'checklist_count',
    jsonb_array_length(coalesce(p_checklist,'[]'::jsonb)),
    'step_count',jsonb_array_length(coalesce(p_steps,'[]'::jsonb)));
end;
$$;


revoke all on function public.create_task_bundle(uuid,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_task_bundle(uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;


create or replace function public.update_task_lifecycle(
  p_organization_id uuid,
  p_task_id text,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_task public.tasks%rowtype;
  v_actor_name text;
  v_now timestamptz := clock_timestamp();
  v_elapsed integer := 0;
  v_status text;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_action not in ('start','pause','resume') then
    raise exception using errcode = '22023', message = 'Unsupported lifecycle action';
  end if;
  if p_action = 'pause' and coalesce(nullif(btrim(p_reason),''),'') = '' then
    raise exception using errcode = '22023', message = 'A pause reason is required';
  end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then
    raise exception using errcode = '42501', message = 'Task edit permission required';
  end if;

  select * into v_task from public.tasks
  where organization_id=p_organization_id and id=p_task_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  select u.name into v_actor_name
  from public.organization_members m
  left join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active
  limit 1;

  if p_action = 'start' then
    if v_task.status in ('completed','approved','pending_approval','cancelled','paused') or (v_task.status='in_progress' and not v_task.is_paused) then
      raise exception using errcode = '22023', message = 'This task cannot be started from its current state';
    end if;
    update public.tasks set status='in_progress',actual_start_time=coalesce(actual_start_time,v_now),
      is_paused=false,paused_at=null,pause_reason=null,is_timer_running=true,
      timer_started_at=v_now,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id returning status into v_status;
  elsif p_action = 'pause' then
    if v_task.status <> 'in_progress' or v_task.is_paused then
      raise exception using errcode = '22023', message = 'Only an active task can be paused';
    end if;
    if v_task.is_timer_running and v_task.timer_started_at is not null then
      v_elapsed := greatest(1,round(extract(epoch from (v_now-v_task.timer_started_at))/60)::integer);
    end if;
    update public.tasks set status='paused',is_paused=true,paused_at=v_now,
      pause_reason=nullif(btrim(p_reason),''),time_spent_minutes=time_spent_minutes+v_elapsed,
      is_timer_running=false,timer_started_at=null,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id returning status into v_status;
  else
    if not v_task.is_paused and v_task.status <> 'paused' then
      raise exception using errcode = '22023', message = 'Only a paused task can be resumed';
    end if;
    update public.tasks set status='in_progress',is_paused=false,paused_at=null,
      pause_reason=null,is_timer_running=true,timer_started_at=v_now,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id returning status into v_status;
  end if;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-life-'||gen_random_uuid()::text,p_organization_id,p_task_id,
    case p_action when 'start' then 'بدء تنفيذ المهمة' when 'pause' then 'إيقاف المهمة مؤقتاً' else 'استئناف تنفيذ المهمة' end,
    coalesce(v_actor_name,'مستخدم النظام'),nullif(btrim(p_reason),''));

  return jsonb_build_object('task_id',p_task_id,'status',v_status,'time_added_minutes',v_elapsed);
end;
$$;

revoke all on function public.update_task_lifecycle(uuid,text,text,text) from public, anon;
grant execute on function public.update_task_lifecycle(uuid,text,text,text) to authenticated;


create or replace function public.review_task_approval(
  p_organization_id uuid,
  p_task_id text,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_task public.tasks%rowtype;
  v_app_user_id text;
  v_actor_name text;
  v_actor_role text;
  v_now timestamptz := clock_timestamp();
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_action not in ('approve','reject') then
    raise exception using errcode = '22023', message = 'Unsupported task review action';
  end if;
  if p_action = 'reject' and coalesce(nullif(btrim(p_notes),''),'') = '' then
    raise exception using errcode = '22023', message = 'A rejection reason is required';
  end if;
  if not private.can_access_task(p_organization_id,p_task_id,'approve') then
    raise exception using errcode = '42501', message = 'Task approval permission required';
  end if;

  select m.app_user_id,m.role,u.name into v_app_user_id,v_actor_role,v_actor_name
  from public.organization_members m
  left join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active
  limit 1;

  select * into v_task from public.tasks
  where organization_id=p_organization_id and id=p_task_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  v_new_status := case when p_action='approve' then 'completed' else 'rejected' end;
  if v_task.status <> 'pending_approval' then
    if v_task.status = v_new_status then
      return jsonb_build_object('task_id',p_task_id,'status',v_task.status,'already_reviewed',true);
    end if;
    raise exception using errcode = '22023', message = 'Task is not awaiting approval';
  end if;

  update public.tasks set
    status=v_new_status,
    approval_notes=case when p_action='approve' then nullif(btrim(p_notes),'') else approval_notes end,
    rejection_reason=case when p_action='reject' then nullif(btrim(p_notes),'') else null end,
    actual_end_time=case when p_action='approve' then coalesce(actual_end_time,v_now) else actual_end_time end,
    updated_at=v_now
  where organization_id=p_organization_id and id=p_task_id;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-review-'||gen_random_uuid()::text,p_organization_id,p_task_id,
    case when p_action='approve' then 'اعتماد إنجاز المهمة' else 'رفض اعتماد المهمة وإعادتها للمراجعة' end,
    coalesce(v_actor_name,'مستخدم النظام'),nullif(btrim(p_notes),''));

  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-review-'||gen_random_uuid()::text,p_organization_id,v_app_user_id,
    coalesce(v_actor_name,'مستخدم النظام'),coalesce(v_actor_role,'viewer'),
    case when p_action='approve' then 'اعتماد مهمة' else 'رفض اعتماد مهمة' end,
    'update','task',p_task_id,coalesce(p_notes,''));

  insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
  values('notif-review-'||gen_random_uuid()::text,p_organization_id,v_task.creator_id,
    case when p_action='approve' then 'تم اعتماد المهمة' else 'أعيدت المهمة للمراجعة' end,
    'تمت مراجعة المهمة "'||v_task.title||'". '||coalesce(p_notes,''),
    case when p_action='approve' then 'success' else 'alert' end,false,'tasks');

  return jsonb_build_object('task_id',p_task_id,'status',v_new_status,'already_reviewed',false);
end;
$$;

revoke all on function public.review_task_approval(uuid,text,text,text) from public, anon;
grant execute on function public.review_task_approval(uuid,text,text,text) to authenticated;
