create or replace function public.manage_task_time_session(
  p_organization_id uuid,
  p_task_id text,
  p_action text,
  p_reason text,
  p_client_event_id uuid,
  p_client_occurred_at timestamptz default null,
  p_device_timezone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_actor_id text;
  v_task public.tasks%rowtype;
  v_session public.task_time_sessions%rowtype;
  v_existing public.task_time_session_events%rowtype;
  v_event_type text;
  v_now timestamptz := clock_timestamp();
  v_active_count integer := 0;
  v_total_seconds bigint := 0;
  v_elapsed_seconds bigint := 0;
  v_added_minutes integer := 0;
  v_legacy_minutes integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode='28000', message='Authentication required';
  end if;
  if p_organization_id is null or p_task_id is null or p_client_event_id is null then
    raise exception using errcode='22023', message='Organization, task and idempotency key are required';
  end if;
  if p_action is null or p_action not in ('start','pause','resume','stop') then
    raise exception using errcode='22023', message='Unsupported employee time-session action';
  end if;
  if p_action='pause' and coalesce(nullif(btrim(p_reason),''),'')='' then
    raise exception using errcode='22023', message='A pause reason is required';
  end if;
  if p_reason is not null and length(p_reason)>1000 then
    raise exception using errcode='22023', message='Reason is too long';
  end if;
  if p_device_timezone is not null and length(p_device_timezone)>80 then
    raise exception using errcode='22023', message='Device timezone is too long';
  end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then
    raise exception using errcode='42501', message='Task edit permission required';
  end if;

  select m.app_user_id into v_actor_id
  from public.organization_members m
  where m.organization_id=p_organization_id
    and m.auth_user_id=auth.uid()
    and m.active
  limit 1;
  if v_actor_id is null then
    raise exception using errcode='42501', message='Active organization member profile required';
  end if;

  select * into v_task
  from public.tasks t
  where t.organization_id=p_organization_id and t.id=p_task_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='Task not found in this organization';
  end if;
  if v_task.is_timer_running and v_task.timer_started_at is not null then
    v_legacy_minutes := greatest(1,round(extract(epoch from (v_now-v_task.timer_started_at))/60)::integer);
  end if;

  v_event_type := case p_action
    when 'start' then 'started'
    when 'pause' then 'paused'
    when 'resume' then 'resumed'
    else 'stopped'
  end;

  select * into v_existing
  from public.task_time_session_events e
  where e.organization_id=p_organization_id and e.client_event_id=p_client_event_id;
  if found then
    if v_existing.task_id<>p_task_id
       or v_existing.actor_auth_user_id<>auth.uid()
       or v_existing.event_type<>v_event_type then
      raise exception using errcode='23505', message='Idempotency key was already used for a different time-session action';
    end if;
    select * into v_session from public.task_time_sessions s where s.id=v_existing.session_id;
    return jsonb_build_object(
      'session_id',v_session.id,
      'status',v_session.status,
      'total_seconds',v_session.total_seconds
        + case when v_session.status='active' then greatest(0,floor(extract(epoch from (v_now-v_session.last_resumed_at)))::bigint) else 0 end,
      'already_processed',true
    );
  end if;

  select * into v_session
  from public.task_time_sessions s
  where s.organization_id=p_organization_id
    and s.task_id=p_task_id
    and s.actor_auth_user_id=auth.uid()
    and s.status in ('active','paused')
  for update;

  if p_action='pause' and not found and v_task.is_timer_running then
    perform pg_catalog.set_config('neer.task_transition','lifecycle',true);
    update public.tasks
    set status='paused',execution_status='paused',
        time_spent_minutes=time_spent_minutes+v_legacy_minutes,
        is_paused=true,paused_at=v_now,pause_reason=nullif(btrim(p_reason),''),
        is_timer_running=false,timer_started_at=null,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id;
    return jsonb_build_object('session_id',null,'status','legacy_closed','total_seconds',v_legacy_minutes*60,'already_processed',false);
  end if;

  if p_action='stop' and not found then
    select count(*)::integer into v_active_count
    from public.task_time_sessions s
    where s.organization_id=p_organization_id and s.task_id=p_task_id and s.status='active';
    if v_task.is_timer_running then
      perform pg_catalog.set_config('neer.task_transition','lifecycle',true);
      update public.tasks
      set time_spent_minutes=time_spent_minutes+v_legacy_minutes,
          is_timer_running=false,timer_started_at=null,updated_at=v_now
      where organization_id=p_organization_id and id=p_task_id;
      return jsonb_build_object('session_id',null,'status','legacy_closed','total_seconds',v_legacy_minutes*60,'active_employee_sessions',v_active_count,'already_processed',false);
    end if;
    return jsonb_build_object(
      'session_id',null,
      'status','none',
      'total_seconds',0,
      'active_employee_sessions',v_active_count,
      'already_processed',false
    );
  end if;

  if p_action='start' then
    if found then
      raise exception using errcode='55000', message='An open time session already exists; resume it or stop it first';
    end if;
    if v_task.status in ('pending_approval','approved','rejected','completed','deferred','cancelled') then
      raise exception using errcode='55000', message='A terminal or approval-stage task cannot start a new employee time session';
    end if;
    insert into public.task_time_sessions (
      organization_id,task_id,actor_auth_user_id,actor_app_user_id,
      status,started_at,last_resumed_at,total_seconds
    ) values (
      p_organization_id,p_task_id,auth.uid(),v_actor_id,
      'active',v_now,v_now,0
    ) returning * into v_session;
  elsif p_action='pause' then
    if not found or v_session.status<>'active' then
      raise exception using errcode='55000', message='Only your active time session can be paused';
    end if;
    v_elapsed_seconds := greatest(0,floor(extract(epoch from (v_now-v_session.last_resumed_at)))::bigint);
    v_added_minutes := floor((v_session.total_seconds + v_elapsed_seconds)/60)::integer
      - floor(v_session.total_seconds/60)::integer;
    v_session.total_seconds := v_session.total_seconds + v_elapsed_seconds;
    update public.task_time_sessions
    set status='paused',last_resumed_at=null,total_seconds=v_session.total_seconds,updated_at=v_now
    where id=v_session.id returning * into v_session;
  elsif p_action='resume' then
    if not found then
      if v_task.status<>'paused' and not v_task.is_paused then
        raise exception using errcode='55000', message='No paused employee session exists and the task is not paused';
      end if;
      insert into public.task_time_sessions (
        organization_id,task_id,actor_auth_user_id,actor_app_user_id,
        status,started_at,last_resumed_at,total_seconds
      ) values (
        p_organization_id,p_task_id,auth.uid(),v_actor_id,
        'active',v_now,v_now,0
      ) returning * into v_session;
    else
      if v_session.status<>'paused' then
        raise exception using errcode='55000', message='Only your paused time session can be resumed';
      end if;
      update public.task_time_sessions
      set status='active',last_resumed_at=v_now,updated_at=v_now
      where id=v_session.id returning * into v_session;
    end if;
  else
    if not found then
      raise exception using errcode='55000', message='No open time session exists for this employee and task';
    end if;
    if v_session.status='active' then
      v_elapsed_seconds := greatest(0,floor(extract(epoch from (v_now-v_session.last_resumed_at)))::bigint);
      v_added_minutes := floor((v_session.total_seconds + v_elapsed_seconds)/60)::integer
        - floor(v_session.total_seconds/60)::integer;
      v_session.total_seconds := v_session.total_seconds + v_elapsed_seconds;
    end if;
    update public.task_time_sessions
    set status='completed',last_resumed_at=null,ended_at=v_now,
        total_seconds=v_session.total_seconds,updated_at=v_now
    where id=v_session.id returning * into v_session;
  end if;

  insert into public.task_time_session_events (
    organization_id,task_id,session_id,actor_auth_user_id,event_type,
    client_event_id,occurred_at,client_occurred_at,device_timezone,reason
  ) values (
    p_organization_id,p_task_id,v_session.id,auth.uid(),v_event_type,
    p_client_event_id,v_now,p_client_occurred_at,left(coalesce(p_device_timezone,''),80),
    nullif(btrim(p_reason),'')
  );

  select count(*)::integer into v_active_count
  from public.task_time_sessions s
  where s.organization_id=p_organization_id and s.task_id=p_task_id and s.status='active';

  perform pg_catalog.set_config('neer.task_transition','lifecycle',true);
  if p_action in ('start','resume') then
    update public.tasks
    set status='in_progress',execution_status='in_progress',
        time_spent_minutes=time_spent_minutes+case when p_action='start' and v_task.is_timer_running then v_legacy_minutes else 0 end,
        actual_start_time=coalesce(actual_start_time,v_now),
        is_paused=false,paused_at=null,pause_reason=null,
        is_timer_running=false,timer_started_at=null,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id;
  else
    update public.tasks
    set time_spent_minutes=time_spent_minutes+v_added_minutes+case when v_task.is_timer_running then v_legacy_minutes else 0 end,
        status=case
          when status in ('pending_approval','approved','rejected','completed','deferred','cancelled') then status
          when v_active_count>0 then 'in_progress'
          else 'paused'
        end,
        execution_status=case
          when execution_status in ('completed','deferred','cancelled') then execution_status
          when v_active_count>0 then 'in_progress'
          else 'paused'
        end,
        is_paused=case
          when status in ('pending_approval','approved','rejected','completed','deferred','cancelled') then is_paused
          else v_active_count=0
        end,
        paused_at=case
          when status in ('pending_approval','approved','rejected','completed','deferred','cancelled') then paused_at
          when v_active_count=0 then v_now
          else null
        end,
        pause_reason=case when v_active_count=0 then nullif(btrim(p_reason),'') else null end,
        is_timer_running=false,timer_started_at=null,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id;
  end if;

  return jsonb_build_object(
    'session_id',v_session.id,
    'status',v_session.status,
    'total_seconds',v_session.total_seconds
      + case when v_session.status='active' then greatest(0,floor(extract(epoch from (v_now-v_session.last_resumed_at)))::bigint) else 0 end,
    'active_employee_sessions',v_active_count,
    'already_processed',false
  );
end;
$BODY$;


revoke all on function public.manage_task_time_session(uuid,text,text,text,uuid,timestamptz,text) from public, anon;
grant execute on function public.manage_task_time_session(uuid,text,text,text,uuid,timestamptz,text) to authenticated;
