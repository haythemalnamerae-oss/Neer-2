-- The API compatibility route now delegates to manage_task_time_session.
-- Remove the obsolete shared-task timer RPC from the exposed authenticated API.
revoke all on function public.update_task_lifecycle(uuid,text,text,text,uuid,timestamptz,text) from public, anon, authenticated;
