-- Atomic field lifecycle: append the immutable event and update task state together.
create or replace function public.record_field_task_event(
  p_organization_id uuid,
  p_task_id text,
  p_event_type text,
  p_event_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_details jsonb,
  p_client_event_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_now timestamptz := clock_timestamp();
  v_task public.tasks%rowtype;
  v_outcome text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not private.is_org_member(p_organization_id) then
    raise exception 'Organization membership required' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or p_accuracy_meters is null or p_accuracy_meters < 0 then
    raise exception 'A valid fresh GPS fix is required' using errcode = '22023';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Event details must be a JSON object' using errcode = '22023';
  end if;
  if p_event_type not in (
    'visit_started','visit_paused','visit_resumed','visit_completed',
    'task_started','task_paused','task_resumed','task_completed'
  ) then
    raise exception 'Unsupported lifecycle event type' using errcode = '22023';
  end if;

  select * into v_task
  from public.tasks
  where organization_id = p_organization_id and id = p_task_id
  for update;
  if not found then
    raise exception 'Task not found in this organization' using errcode = 'P0002';
  end if;

  insert into public.task_events (
    organization_id, task_id, standing_account_id, actor_auth_user_id,
    event_type, event_label, occurred_at, latitude, longitude,
    accuracy_meters, location_status, client_event_id, details
  ) values (
    p_organization_id, p_task_id, v_task.standing_account_id, auth.uid(),
    p_event_type, coalesce(p_event_label,''), v_now, p_latitude, p_longitude,
    p_accuracy_meters, 'captured', p_client_event_id, p_details
  )
  on conflict (organization_id, client_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id from public.task_events
    where organization_id = p_organization_id and client_event_id = p_client_event_id;
    return v_event_id;
  end if;

  if p_event_type in ('visit_started','task_started') then
    update public.tasks set
      status = 'in_progress',
      actual_start_time = coalesce(actual_start_time, v_now),
      is_paused = false,
      paused_at = null,
      pause_reason = null,
      is_timer_running = true,
      timer_started_at = v_now,
      updated_at = v_now
    where organization_id = p_organization_id and id = p_task_id;
  elsif p_event_type in ('visit_paused','task_paused') then
    update public.tasks set
      status = 'paused',
      is_paused = true,
      paused_at = v_now,
      pause_reason = nullif(btrim(p_details->>'reason'),''),
      is_timer_running = false,
      timer_started_at = null,
      updated_at = v_now
    where organization_id = p_organization_id and id = p_task_id;
  elsif p_event_type in ('visit_resumed','task_resumed') then
    update public.tasks set
      status = 'in_progress',
      is_paused = false,
      paused_at = null,
      pause_reason = null,
      is_timer_running = true,
      timer_started_at = v_now,
      updated_at = v_now
    where organization_id = p_organization_id and id = p_task_id;
  else
    v_outcome := p_details->>'outcome';
    if v_outcome not in ('completed','partially_completed','not_completed','unable_to_execute','needs_followup') then
      raise exception 'A valid task outcome is required' using errcode = '22023';
    end if;
    update public.tasks set
      status = case when v_outcome = 'completed' then 'pending_approval' else 'deferred' end,
      outcome = v_outcome,
      outcome_reason = p_details->>'reason',
      outcome_notes = p_details->>'notes',
      outcome_submitted_at = v_now,
      proof_attachment_url = coalesce(nullif(p_details->>'proofUrl',''), proof_attachment_url),
      actual_end_time = v_now,
      is_paused = false,
      is_timer_running = false,
      timer_started_at = null,
      updated_at = v_now
    where organization_id = p_organization_id and id = p_task_id;
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.record_field_task_event(uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid) from public, anon;
grant execute on function public.record_field_task_event(uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid) to authenticated;
