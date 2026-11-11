-- Tighten task and task-child row access by organization role and assignee.
-- Review-only migration: do not apply to production until tested against role fixtures.
create or replace function private.can_assign_task(
  target_org uuid,
  target_assignee_id text,
  required_action text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.auth_user_id = (select auth.uid())
      and m.active
      and (
        m.role = 'admin'
        or (
          exists (
            select 1 from public.role_permissions rp
            where rp.organization_id = m.organization_id
              and rp.role_key = m.role
              and rp.permission_key = 'tasks.' || required_action
              and rp.granted
          )
          and (m.role <> 'field_officer' or m.app_user_id = target_assignee_id)
        )
      )
  );
$$;

create or replace function private.can_access_task(
  target_org uuid,
  target_task_id text,
  required_action text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.tasks t
    join public.organization_members m
      on m.organization_id = t.organization_id
     and m.auth_user_id = (select auth.uid())
     and m.active
    where t.organization_id = target_org
      and t.id = target_task_id
      and (
        m.role = 'admin'
        or (
          exists (
            select 1 from public.role_permissions rp
            where rp.organization_id = m.organization_id
              and rp.role_key = m.role
              and rp.permission_key = 'tasks.' || required_action
              and rp.granted
          )
          and (m.role <> 'field_officer' or t.assignee_id = m.app_user_id)
        )
      )
  );
$$;

revoke all on function private.can_assign_task(uuid,text,text) from public, anon;
revoke all on function private.can_access_task(uuid,text,text) from public, anon;
grant execute on function private.can_assign_task(uuid,text,text) to authenticated;
grant execute on function private.can_access_task(uuid,text,text) to authenticated;

-- Tasks: role permission plus field-officer assignment scope.
drop policy if exists org_member_access on public.tasks;
drop policy if exists tasks_scoped_select on public.tasks;
drop policy if exists tasks_scoped_insert on public.tasks;
drop policy if exists tasks_scoped_update on public.tasks;
drop policy if exists tasks_scoped_delete on public.tasks;

create policy tasks_scoped_select on public.tasks
for select to authenticated
using (private.can_assign_task(organization_id, assignee_id, 'view'));

create policy tasks_scoped_insert on public.tasks
for insert to authenticated
with check (private.can_assign_task(organization_id, assignee_id, 'create'));

create policy tasks_scoped_update on public.tasks
for update to authenticated
using (private.can_access_task(organization_id, id, 'edit'))
with check (private.can_assign_task(organization_id, assignee_id, 'edit'));

create policy tasks_scoped_delete on public.tasks
for delete to authenticated
using (private.can_access_task(organization_id, id, 'delete'));

-- Child records inherit the access of their parent task.
drop policy if exists org_member_access on public.task_checklist_items;
create policy task_checklist_scoped_access on public.task_checklist_items
for all to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'))
with check (private.can_access_task(organization_id, task_id, 'edit') or private.can_access_task(organization_id, task_id, 'create'));

drop policy if exists org_member_access on public.task_steps;
create policy task_steps_scoped_access on public.task_steps
for all to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'))
with check (private.can_access_task(organization_id, task_id, 'edit') or private.can_access_task(organization_id, task_id, 'create'));

drop policy if exists org_member_access on public.task_subtasks;
create policy task_subtasks_scoped_access on public.task_subtasks
for all to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'))
with check (private.can_access_task(organization_id, task_id, 'edit') or private.can_access_task(organization_id, task_id, 'create'));

drop policy if exists org_member_access on public.task_daily_updates;
create policy task_daily_updates_scoped_access on public.task_daily_updates
for all to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'))
with check (private.can_access_task(organization_id, task_id, 'edit') or private.can_access_task(organization_id, task_id, 'create'));

drop policy if exists org_member_access on public.task_attachments;
create policy task_attachments_scoped_access on public.task_attachments
for all to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'))
with check (private.can_access_task(organization_id, task_id, 'edit') or private.can_access_task(organization_id, task_id, 'create'));

drop policy if exists org_member_access on public.task_comments;
create policy task_comments_scoped_access on public.task_comments
for all to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'))
with check (private.can_access_task(organization_id, task_id, 'edit') or private.can_access_task(organization_id, task_id, 'create'));

-- History is append-only to authenticated clients; task updates are represented by new rows.
drop policy if exists org_member_access on public.task_history;
create policy task_history_scoped_select on public.task_history
for select to authenticated
using (private.can_access_task(organization_id, task_id, 'view'));
create policy task_history_scoped_insert on public.task_history
for insert to authenticated
with check (private.can_access_task(organization_id, task_id, 'edit') or private.can_access_task(organization_id, task_id, 'create'));

-- Preserve the existing append-only event writer; scope event reads to visible tasks.
drop policy if exists task_events_member_read on public.task_events;
create policy task_events_scoped_read on public.task_events
for select to authenticated
using (private.can_access_task(organization_id, task_id, 'view'));
