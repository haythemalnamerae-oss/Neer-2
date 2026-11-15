-- Independent employee time sessions for shared/group tasks.
-- This is additive: legacy task-level timer columns and historical records remain untouched.

create table if not exists public.task_time_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id text not null,
  actor_auth_user_id uuid not null,
  actor_app_user_id text not null,
  status text not null check (status in ('active','paused','completed')),
  started_at timestamptz not null,
  last_resumed_at timestamptz,
  ended_at timestamptz,
  total_seconds bigint not null default 0 check (total_seconds >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (status = 'active' and last_resumed_at is not null and ended_at is null)
    or (status = 'paused' and last_resumed_at is null and ended_at is null)
    or (status = 'completed' and last_resumed_at is null and ended_at is not null)
  )
);

create unique index if not exists task_time_sessions_one_open_per_actor_task
  on public.task_time_sessions (organization_id, task_id, actor_auth_user_id)
  where status in ('active','paused');

create index if not exists task_time_sessions_task_history_idx
  on public.task_time_sessions (organization_id, task_id, started_at desc);

create index if not exists task_time_sessions_actor_history_idx
  on public.task_time_sessions (organization_id, actor_auth_user_id, started_at desc);

create table if not exists public.task_time_session_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id text not null,
  session_id uuid not null references public.task_time_sessions(id) on delete restrict,
  actor_auth_user_id uuid not null,
  event_type text not null check (event_type in ('started','paused','resumed','stopped')),
  client_event_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  client_occurred_at timestamptz,
  device_timezone text,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, client_event_id)
);

create index if not exists task_time_session_events_task_idx
  on public.task_time_session_events (organization_id, task_id, occurred_at desc);

alter table public.task_time_sessions enable row level security;
alter table public.task_time_session_events enable row level security;

drop policy if exists task_time_sessions_scoped_read on public.task_time_sessions;
create policy task_time_sessions_scoped_read
  on public.task_time_sessions
  for select to authenticated
  using (private.can_access_task(organization_id, task_id, 'view'));

drop policy if exists task_time_session_events_scoped_read on public.task_time_session_events;
create policy task_time_session_events_scoped_read
  on public.task_time_session_events
  for select to authenticated
  using (private.can_access_task(organization_id, task_id, 'view'));

revoke all on table public.task_time_sessions from public, anon, authenticated;
revoke all on table public.task_time_session_events from public, anon, authenticated;
grant select on table public.task_time_sessions to authenticated;
grant select on table public.task_time_session_events to authenticated;

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
    if not found or v_session.status<>'paused' then
      raise exception using errcode='55000', message='Only your paused time session can be resumed';
    end if;
    update public.task_time_sessions
    set status='active',last_resumed_at=v_now,updated_at=v_now
    where id=v_session.id returning * into v_session;
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
        actual_start_time=coalesce(actual_start_time,v_now),
        is_paused=false,paused_at=null,pause_reason=null,
        is_timer_running=false,timer_started_at=null,updated_at=v_now
    where organization_id=p_organization_id and id=p_task_id;
  else
    update public.tasks
    set time_spent_minutes=time_spent_minutes+v_added_minutes,
        status=case when v_active_count=0 and status not in ('pending_approval','approved','rejected','completed','deferred','cancelled') then 'paused' else status end,
        execution_status=case when v_active_count=0 and execution_status not in ('completed','deferred','cancelled') then 'paused' else execution_status end,
        is_paused=(v_active_count=0 and status not in ('pending_approval','approved','rejected','completed','deferred','cancelled')),
        paused_at=case when v_active_count=0 then v_now else paused_at end,
        pause_reason=case when v_active_count=0 then nullif(btrim(p_reason),'') else pause_reason end,
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
