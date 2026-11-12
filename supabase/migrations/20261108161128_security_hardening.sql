-- Security hardening for the organization boundary, privileged helpers, and FK lookup paths.
-- Safe for existing rows: no table or business data is deleted or rewritten.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Move SECURITY DEFINER helpers out of the PostgREST-exposed public schema.
alter function public.is_org_member(uuid) set schema private;
alter function public.has_org_role(uuid, text[]) set schema private;
alter function public.seed_default_role_permissions(uuid) set schema private;
alter function public.seed_org_rbac_defaults() set schema private;

-- The trigger remains attached to organizations; update its body to call the moved seeder.
create or replace function private.seed_org_rbac_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_role_permissions(new.id);
  return new;
end;
$$;

-- The helpers are callable by authenticated RLS policy evaluation only.
revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_role(uuid, text[]) from public, anon, authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

-- Seed functions are trigger/internal-only, never RPC endpoints.
revoke all on function private.seed_default_role_permissions(uuid) from public, anon, authenticated;
revoke all on function private.seed_org_rbac_defaults() from public, anon, authenticated;

-- Close the critical tenant-membership gap.
alter table public.organization_members enable row level security;
revoke all on table public.organization_members from public, anon;
grant select, insert, update, delete on table public.organization_members to authenticated;

-- Avoid overlapping permissive SELECT policies while retaining the same access model.
drop policy if exists membership_read on public.organization_members;
drop policy if exists membership_admin_manage on public.organization_members;
create policy membership_read on public.organization_members
  for select to authenticated
  using (auth_user_id = (select auth.uid()) or private.has_org_role(organization_id, array['admin']));
create policy membership_admin_insert on public.organization_members
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['admin']));
create policy membership_admin_update on public.organization_members
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin']))
  with check (private.has_org_role(organization_id, array['admin']));
create policy membership_admin_delete on public.organization_members
  for delete to authenticated
  using (private.has_org_role(organization_id, array['admin']));

drop policy if exists app_users_read on public.app_users;
drop policy if exists app_users_admin_manage on public.app_users;
create policy app_users_read on public.app_users
  for select to authenticated using (private.is_org_member(organization_id));
create policy app_users_admin_insert on public.app_users
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin']));
create policy app_users_admin_update on public.app_users
  for update to authenticated using (private.has_org_role(organization_id, array['admin']))
  with check (private.has_org_role(organization_id, array['admin']));
create policy app_users_admin_delete on public.app_users
  for delete to authenticated using (private.has_org_role(organization_id, array['admin']));

drop policy if exists roles_member_read on public.roles;
drop policy if exists roles_admin_manage on public.roles;
create policy roles_member_read on public.roles
  for select to authenticated using (private.is_org_member(organization_id));
create policy roles_admin_insert on public.roles
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin']));
create policy roles_admin_update on public.roles
  for update to authenticated using (private.has_org_role(organization_id, array['admin']))
  with check (private.has_org_role(organization_id, array['admin']));
create policy roles_admin_delete on public.roles
  for delete to authenticated using (private.has_org_role(organization_id, array['admin']));

drop policy if exists role_permissions_member_read on public.role_permissions;
drop policy if exists role_permissions_admin_manage on public.role_permissions;
create policy role_permissions_member_read on public.role_permissions
  for select to authenticated using (private.is_org_member(organization_id));
create policy role_permissions_admin_insert on public.role_permissions
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin']));
create policy role_permissions_admin_update on public.role_permissions
  for update to authenticated using (private.has_org_role(organization_id, array['admin']))
  with check (private.has_org_role(organization_id, array['admin']));
create policy role_permissions_admin_delete on public.role_permissions
  for delete to authenticated using (private.has_org_role(organization_id, array['admin']));

drop policy if exists settings_admin_read on public.system_settings;
drop policy if exists settings_admin_manage on public.system_settings;
create policy settings_admin_read on public.system_settings
  for select to authenticated using (private.has_org_role(organization_id, array['admin']));
create policy settings_admin_insert on public.system_settings
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin']));
create policy settings_admin_update on public.system_settings
  for update to authenticated using (private.has_org_role(organization_id, array['admin']))
  with check (private.has_org_role(organization_id, array['admin']));
create policy settings_admin_delete on public.system_settings
  for delete to authenticated using (private.has_org_role(organization_id, array['admin']));

-- Cover every foreign key reported by the Performance Advisor.
create index if not exists app_users_auth_user_id_fk_idx on public.app_users(auth_user_id);
create index if not exists cash_receipts_org_fund_fk_idx on public.cash_receipts(organization_id, fund_id);
create index if not exists expenses_org_task_fk_idx on public.expenses(organization_id, task_id);
create index if not exists follow_ups_org_task_fk_idx on public.follow_ups(organization_id, task_id);
create index if not exists role_permissions_permission_fk_idx on public.role_permissions(permission_key);
create index if not exists settlement_expenses_org_expense_fk_idx on public.settlement_expenses(organization_id, expense_id);
create index if not exists settlements_org_fund_fk_idx on public.settlements(organization_id, fund_id);
create index if not exists task_attachments_org_task_fk_idx on public.task_attachments(organization_id, task_id);
create index if not exists task_comments_org_task_fk_idx on public.task_comments(organization_id, task_id);
create index if not exists task_daily_updates_org_task_fk_idx on public.task_daily_updates(organization_id, task_id);
create index if not exists task_steps_org_task_fk_idx on public.task_steps(organization_id, task_id);
create index if not exists task_subtasks_org_task_fk_idx on public.task_subtasks(organization_id, task_id);
create index if not exists tasks_org_parent_task_fk_idx on public.tasks(organization_id, parent_task_id);
