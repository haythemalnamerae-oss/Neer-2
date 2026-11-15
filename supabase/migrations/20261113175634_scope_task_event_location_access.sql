-- Restrict sensitive task GPS/event reads and writes to the task permission scope.
-- Existing event history is preserved; only row visibility and insert authorization change.

drop policy if exists task_events_member_read on public.task_events;
drop policy if exists task_events_scoped_read on public.task_events;
create policy task_events_scoped_read
  on public.task_events
  for select
  to authenticated
  using (private.can_access_task(organization_id,task_id,'view'));

drop policy if exists task_events_actor_insert on public.task_events;
drop policy if exists task_events_scoped_actor_insert on public.task_events;
create policy task_events_scoped_actor_insert
  on public.task_events
  for insert
  to authenticated
  with check (
    actor_auth_user_id=(select auth.uid())
    and private.is_org_member(organization_id)
    and private.can_access_task(organization_id,task_id,'edit')
  );

revoke update, delete, truncate, references, trigger on public.task_events from anon, authenticated;
revoke all on public.task_events from anon, public;
grant select, insert on public.task_events to authenticated;
alter table public.task_events enable row level security;
