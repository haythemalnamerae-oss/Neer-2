-- Remove the now-unused compatibility wrapper after the API was switched to
-- the directly secured record_field_task_event RPC. The wrapper has no callers.
drop function if exists public.record_field_task_event_secure(
  uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid
);
