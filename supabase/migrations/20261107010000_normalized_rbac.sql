-- Normalized RBAC catalog and tenant-specific role grants.
-- Passwords and Auth users are intentionally provisioned in Supabase Auth, never in SQL.

create table if not exists public.permission_catalog (
  permission_key text primary key,
  module_key text not null,
  action_key text not null check (action_key in ('view','create','edit','delete','approve')),
  label_ar text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (module_key, action_key)
);

insert into public.permission_catalog (permission_key, module_key, action_key, label_ar)
select module_key || '.' || action_key, module_key, action_key, label_ar
from (values
  ('dashboard','عرض لوحة المؤشرات'),('tasks','إدارة المهام'),('followUps','إدارة المتابعات'),
  ('funds','إدارة العهد'),('expenses','إدارة المصروفات'),('settlements','إدارة التسويات'),
  ('calendar','إدارة التقويم'),('reports','إدارة التقارير'),('team','إدارة الفري��'),
  ('users','إدارة المستخدمين'),('roles','إدارة الأدوار والصلاحيات'),('audit','سجل التدقيق'),
  ('settings','إعدادات النظام'),('aiAdvisor','المساعد الذكي')
) as modules(module_key, label_ar)
cross join (values
  ('view','عرض'),('create','إنشاء'),('edit','تعديل'),('delete','حذف'),('approve','اعتماد')
) as actions(action_key, action_ar)
on conflict (permission_key) do update set label_ar = excluded.label_ar;

create table if not exists public.role_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_key text not null check (role_key in ('admin','ops_manager','finance_officer','field_officer','viewer')),
  permission_key text not null references public.permission_catalog(permission_key) on delete cascade,
  granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, role_key, permission_key)
);
create index if not exists role_permissions_lookup_idx on public.role_permissions(organization_id, role_key, permission_key) where granted;

create or replace function public.seed_default_role_permissions(target_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.role_permissions (organization_id, role_key, permission_key, granted)
  select target_org, roles.role_key, p.permission_key,
    case
      when roles.role_key = 'admin' then
        not (p.module_key = 'audit' and p.action_key in ('create','edit','delete','approve'))
      when roles.role_key = 'viewer' then
        p.action_key = 'view' and p.module_key not in ('users','roles','audit','settings','aiAdvisor')
      when roles.role_key = 'field_officer' then
        (p.action_key = 'view' and p.module_key in ('dashboard','tasks','followUps','funds','expenses','settlements','calendar','team'))
        or (p.module_key = 'tasks' and p.action_key = 'edit')
        or (p.module_key = 'followUps' and p.action_key in ('create','edit'))
        or (p.module_key = 'expenses' and p.action_key = 'create')
      when roles.role_key = 'ops_manager' then
        (p.action_key = 'view' and p.module_key in ('dashboard','tasks','followUps','funds','expenses','settlements','calendar','reports','team','users','roles','audit','aiAdvisor'))
        or (p.module_key in ('tasks','followUps') and p.action_key in ('create','edit','delete','approve'))
        or (p.module_key = 'calendar' and p.action_key in ('create','edit','delete'))
        or (p.module_key = 'expenses' and p.action_key in ('create','edit'))
        or (p.module_key = 'reports' and p.action_key = 'create')
        or (p.module_key = 'team' and p.action_key in ('create','edit'))
        or (p.module_key = 'aiAdvisor' and p.action_key in ('create','view'))
      when roles.role_key = 'finance_officer' then
        (p.action_key = 'view' and p.module_key in ('dashboard','tasks','followUps','funds','expenses','settlements','calendar','reports','team','audit','settings','aiAdvisor'))
        or (p.module_key = 'funds' and p.action_key in ('create','edit','approve'))
        or (p.module_key = 'expenses' and p.action_key in ('create','edit','delete','approve'))
        or (p.module_key = 'settlements' and p.action_key in ('create','edit','approve'))
        or (p.module_key = 'reports' and p.action_key in ('create','edit','approve'))
        or (p.module_key = 'settings' and p.action_key = 'edit')
        or (p.module_key = 'aiAdvisor' and p.action_key = 'create')
      else false
    end
  from (values ('admin'),('ops_manager'),('finance_officer'),('field_officer'),('viewer')) roles(role_key)
  cross join public.permission_catalog p
  on conflict (organization_id, role_key, permission_key) do nothing;
$$;

create or replace function public.seed_org_rbac_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_role_permissions(new.id);
  return new;
end;
$$;

drop trigger if exists seed_org_rbac_defaults on public.organizations;
create trigger seed_org_rbac_defaults after insert on public.organizations
for each row execute function public.seed_org_rbac_defaults();

select public.seed_default_role_permissions(id) from public.organizations;

create or replace function public.set_role_permission_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists set_role_permission_updated_at on public.role_permissions;
create trigger set_role_permission_updated_at before update on public.role_permissions
for each row execute function public.set_role_permission_updated_at();

alter table public.permission_catalog enable row level security;
alter table public.role_permissions enable row level security;
drop policy if exists permission_catalog_authenticated_read on public.permission_catalog;
create policy permission_catalog_authenticated_read on public.permission_catalog for select to authenticated using (true);
drop policy if exists role_permissions_member_read on public.role_permissions;
create policy role_permissions_member_read on public.role_permissions for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists role_permissions_admin_manage on public.role_permissions;
create policy role_permissions_admin_manage on public.role_permissions for all to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));
grant select on public.permission_catalog to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant execute on function public.seed_default_role_permissions(uuid) to authenticated;
