-- Lifecycle transitions must always carry a stable idempotency key.
create or replace function public.update_task_lifecycle(
  p_organization_id uuid,
  p_task_id text,
  p_action text,
  p_reason text default null,
  p_client_event_id uuid default null,
  p_client_occurred_at timestamptz default null,
  p_device_timezone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_task public.tasks%rowtype;
  v_actor_id text;
  v_actor_name text;
  v_actor_role text;
  v_now timestamptz := clock_timestamp();
  v_elapsed integer := 0;
  v_status text;
  v_event_id uuid;
  v_existing public.task_events%rowtype;
  v_event_type text;
  v_key uuid := p_client_event_id;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_organization_id is null or p_task_id is null then
    raise exception using errcode = '22023', message = 'Organization and task are required';
  end if;
  if p_client_event_id is null then
    raise exception using errcode = '22023', message = 'A stable client event idempotency key is required';
  end if;
  if p_action is null or p_action not in ('start','pause','resume') then
    raise exception using errcode = '22023', message = 'Unsupported lifecycle action';
  end if;
  if p_action='pause' and coalesce(nullif(btrim(p_reason),''),'')='' then
    raise exception using errcode = '22023', message = 'A pause reason is required';
  end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then
    raise exception using errcode = '42501', message = 'Task edit permission required';
  end if;

  v_event_type := case p_action when 'start' then 'task_started' when 'pause' then 'task_paused' else 'task_resumed' end;

  select * into v_existing from public.task_events
  where organization_id=p_organization_id and client_event_id=v_key;
  if found then
    if v_existing.task_id<>p_task_id or v_existing.actor_auth_user_id<>auth.uid()
       or v_existing.event_type<>v_event_type then
      raise exception using errcode='23505',message='Idempotency key was already used for a different event';
    end if;
    return jsonb_build_object('task_id',p_task_id,'status',(select status from public.tasks where organization_id=p_organization_id and id=p_task_id),'event_id',v_existing.id,'already_processed',true);
  end if;

  select * into v_task from public.tasks
  where organization_id=p_organization_id and id=p_task_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  -- Re-check after the row lock to make simultaneous idempotent retries safe.
  select * into v_existing from public.task_events
  where organization_id=p_organization_id and client_event_id=v_key;
  if found then
    if v_existing.task_id<>p_task_id or v_existing.actor_auth_user_id<>auth.uid()
       or v_existing.event_type<>v_event_type then
      raise exception using errcode='23505',message='Idempotency key was already used for a different event';
    end if;
    return jsonb_build_object('task_id',p_task_id,'status',v_task.status,'event_id',v_existing.id,'already_processed',true);
  end if;

  if v_task.task_type_category in ('field','visit') then
    raise exception using errcode='22023',message='Field and visit tasks must use the GPS lifecycle workflow';
  end if;

  select m.app_user_id,u.name,m.role into v_actor_id,v_actor_name,v_actor_role
  from public.organization_members m
  left join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active
  limit 1;
  if v_actor_id is null then
    raise exception using errcode='42501',message='Active organization member profile required';
  end if;

  if p_action='start' then
    if v_task.status in ('completed','approved','pending_approval','cancelled','paused')
       or (v_task.status='in_progress' and not v_task.is_paused) then
      raise exception using errcode='22023',message='This task cannot be started from its current state';
    end if;
    perform set_config('neer.task_transition','lifecycle',true);
    update public.tasks set status='in_progress',execution_status='in_progress',
      actual_start_time=coalesce(actual_start_time,v_now),
      is_paused=false,paused_at=null,pause_reason=null,is_timer_running=true,
      timer_started_at=v_now,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id returning status into v_status;
  elsif p_action='pause' then
    if v_task.status<>'in_progress' or v_task.is_paused or not v_task.is_timer_running then
      raise exception using errcode='22023',message='Only an active task can be paused';
    end if;
    v_elapsed := greatest(1,round(extract(epoch from (v_now-v_task.timer_started_at))/60)::integer);
    perform set_config('neer.task_transition','lifecycle',true);
    update public.tasks set status='paused',execution_status='paused',
      is_paused=true,paused_at=v_now,pause_reason=nullif(btrim(p_reason),''),
      time_spent_minutes=time_spent_minutes+v_elapsed,
      is_timer_running=false,timer_started_at=null,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id returning status into v_status;
  else
    if v_task.status<>'paused' or not v_task.is_paused then
      raise exception using errcode='22023',message='Only a paused task can be resumed';
    end if;
    perform set_config('neer.task_transition','lifecycle',true);
    update public.tasks set status='in_progress',execution_status='in_progress',
      is_paused=false,paused_at=null,pause_reason=null,
      is_timer_running=true,timer_started_at=v_now,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id returning status into v_status;
  end if;

  insert into public.task_events(
    organization_id,task_id,standing_account_id,actor_auth_user_id,
    event_type,event_label,occurred_at,location_status,client_event_id,details
  ) values(
    p_organization_id,p_task_id,v_task.standing_account_id,auth.uid(),
    v_event_type,
    case p_action when 'start' then 'بدء تنفيذ المهمة' when 'pause' then 'إيقاف المهمة مؤقتاً' else 'استئناف تنفيذ المهمة' end,
    v_now,'not_requested',v_key,
    jsonb_build_object('reason',nullif(btrim(p_reason),''),'clientOccurredAt',p_client_occurred_at,
      'deviceTimezone',left(coalesce(p_device_timezone,''),80),'timeSource','server_received_at')
  ) returning id into v_event_id;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-life-'||v_key::text,p_organization_id,p_task_id,
    case p_action when 'start' then 'بدء تنفيذ المهمة' when 'pause' then 'إيقاف المهمة مؤقتاً' else 'استئناف تنفيذ المهمة' end,
    coalesce(v_actor_name,'مستخدم النظام'),nullif(btrim(p_reason),''));

  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-life-'||v_key::text,p_organization_id,v_actor_id,
    coalesce(v_actor_name,'مستخدم النظام'),coalesce(v_actor_role,'viewer'),
    case p_action when 'start' then 'بدء مهمة' when 'pause' then 'إيقاف مهمة مؤقتاً' else 'استئناف مهمة' end,
    'update','task',p_task_id,coalesce(p_reason,''));

  return jsonb_build_object('task_id',p_task_id,'status',v_status,'time_added_minutes',v_elapsed,'event_id',v_event_id,'already_processed',false);
end;
$$;

revoke all on function public.update_task_lifecycle(uuid,text,text,text,uuid,timestamptz,text) from public, anon;
grant execute on function public.update_task_lifecycle(uuid,text,text,text,uuid,timestamptz,text) to authenticated;
