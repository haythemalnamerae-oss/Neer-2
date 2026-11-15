-- The GPS lifecycle RPC already performs explicit auth.uid(), active tenant membership,
-- task permission, task-category, state, location and idempotency checks. Run it as its
-- owner so authenticated users do not need direct INSERT privilege on the append-only ledger.
alter function public.record_field_task_event(
  uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid
) security definer;

revoke all on function public.record_field_task_event_secure(
  uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid
) from public, anon, authenticated;
