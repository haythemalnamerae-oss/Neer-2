-- Force all authenticated task-event writes through validated transactional RPCs.
-- No historical task, event, or financial rows are changed.
create or replace function public.record_task_event(
  p_organization_id uuid,
  p_task_id text,
  p_event_type text,
  p_event_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_location_status text,
  p_details jsonb,
  p_client_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_existing public.task_events%rowtype;
  v_event_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception using errcode='28000', message='Authentication required';
  end if;
  if p_organization_id is null or p_task_id is null or p_client_event_id is null then
    raise exception using errcode='22023', message='Organization, task and idempotency key are required';
  end if;
  if p_event_type is null or p_event_type not in (
    'location_sample','subtask_created','expense_recorded','invoice_attached',
    'follow_up_scheduled','note_added','status_changed','location_unavailable'
  ) then
    raise exception using errcode='22023', message='Unsupported non-lifecycle task event type';
  end if;
  if p_event_label is null or nullif(btrim(p_event_label),'') is null or length(p_event_label)>200 then
    raise exception using errcode='22023', message='Event label must contain 1 to 200 characters';
  end if;
  if p_details is null or pg_catalog.jsonb_typeof(p_details)<>'object'
     or pg_catalog.octet_length(p_details::text)>20000 then
    raise exception using errcode='22023', message='Event details must be a JSON object no larger than 20KB';
  end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then
    raise exception using errcode='42501', message='Task edit permission required';
  end if;

  if p_event_type='location_unavailable' then
    if p_location_status is null or p_location_status not in ('permission_denied','services_disabled','unavailable','timeout')
       or p_latitude is not null or p_longitude is not null or p_accuracy_meters is not null then
      raise exception using errcode='22023', message='A location-unavailable event must not contain coordinates';
    end if;
  else
    if p_location_status is null or p_location_status<>'captured'
       or p_latitude is null or p_latitude not between -90 and 90
       or p_longitude is null or p_longitude not between -180 and 180
       or p_accuracy_meters is null or p_accuracy_meters<0 or p_accuracy_meters>100000 then
      raise exception using errcode='22023', message='A valid captured GPS fix is required';
    end if;
  end if;

  select * into v_task
  from public.tasks
  where organization_id=p_organization_id and id=p_task_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='Task not found in this organization';
  end if;

  select * into v_existing from public.task_events
  where organization_id=p_organization_id and client_event_id=p_client_event_id;
  if found then
    if v_existing.task_id<>p_task_id or v_existing.actor_auth_user_id<>auth.uid()
       or v_existing.event_type<>p_event_type then
      raise exception using errcode='23505', message='Idempotency key was already used for a different event';
    end if;
    return v_existing.id;
  end if;

  insert into public.task_events(
    organization_id,task_id,standing_account_id,actor_auth_user_id,
    event_type,event_label,occurred_at,latitude,longitude,accuracy_meters,
    location_status,client_event_id,details
  ) values (
    p_organization_id,p_task_id,v_task.standing_account_id,auth.uid(),
    p_event_type,p_event_label,v_now,p_latitude,p_longitude,p_accuracy_meters,
    p_location_status,p_client_event_id,
    p_details || pg_catalog.jsonb_build_object(
      'timeSource','server_received_at',
      'receivedAt',v_now,
      'locationQuality',case
        when p_accuracy_meters is null then 'unavailable'
        when p_accuracy_meters<=20 then 'precise'
        when p_accuracy_meters<=100 then 'approximate'
        else 'low_accuracy'
      end
    )
  )
  on conflict (organization_id,client_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select * into v_existing from public.task_events
    where organization_id=p_organization_id and client_event_id=p_client_event_id;
    if v_existing.task_id<>p_task_id or v_existing.actor_auth_user_id<>auth.uid()
       or v_existing.event_type<>p_event_type then
      raise exception using errcode='23505', message='Idempotency key was concurrently used for a different event';
    end if;
    return v_existing.id;
  end if;
  return v_event_id;
end;
$$;

-- The wrapper runs the existing, fully validating lifecycle RPC with owner privileges,
-- while preserving auth.uid() from the caller's JWT.
create or replace function public.record_field_task_event_secure(
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
language sql
security definer
set search_path = ''
as $$
  select public.record_field_task_event(
    p_organization_id,p_task_id,p_event_type,p_event_label,
    p_latitude,p_longitude,p_accuracy_meters,p_details,p_client_event_id
  );
$$;

revoke all on function public.record_task_event(uuid,text,text,text,double precision,double precision,double precision,text,jsonb,uuid) from public, anon;
grant execute on function public.record_task_event(uuid,text,text,text,double precision,double precision,double precision,text,jsonb,uuid) to authenticated;

revoke all on function public.record_field_task_event(uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.record_field_task_event_secure(uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid) from public, anon;
grant execute on function public.record_field_task_event_secure(uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid) to authenticated;

revoke insert on table public.task_events from authenticated;
