-- Atomic task creation: parent task, checklist, steps, optional parent link and history.
-- This migration is committed for review only. Do not apply to production without approval.
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
