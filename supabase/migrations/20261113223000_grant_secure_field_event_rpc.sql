-- Permit authenticated callers to invoke the SECURITY DEFINER lifecycle RPC.
-- Authorization remains enforced inside the function using auth.uid(), active membership,
-- and private.can_access_task(...,'edit'); direct table INSERT remains revoked.
revoke all on function public.record_field_task_event(
  uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid
) from public, anon;
grant execute on function public.record_field_task_event(
  uuid,text,text,text,double precision,double precision,double precision,jsonb,uuid
) to authenticated;
