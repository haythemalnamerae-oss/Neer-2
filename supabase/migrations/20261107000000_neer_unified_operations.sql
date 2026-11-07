-- Neer unified operations schema for Supabase / PostgreSQL.
-- Apply through Supabase CLI: supabase db push
-- This migration creates the schema only; it does not create Auth users or demo data.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auth membership is the trust boundary for tenant access. Never accept org_id/role
-- from the browser as proof of authorization.
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  app_user_id text,
  role text not null default 'viewer' check (role in ('admin','ops_manager','finance_officer','field_officer','viewer')),
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, auth_user_id),
  unique (organization_id, app_user_id)
);
create index if not exists organization_members_auth_user_idx on public.organization_members(auth_user_id);

create table if not exists public.app_users (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  role text not null default 'viewer' check (role in ('admin','ops_manager','finance_officer','field_officer','viewer')),
  role_title_ar text not null default '',
  phone text not null default '',
  department text not null default '',
  avatar text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, email),
  unique (organization_id, auth_user_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  name_ar text not null,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.system_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('urgent','high','medium','low')),
  status text not null default 'new' check (status in ('new','scheduled','started','in_progress','paused','pending_approval','approved','rejected','deferred','cancelled','todo','review','completed')),
  assignee_id text,
  assignee_name text not null default '',
  assignee_avatar text,
  supervisor_id text,
  supervisor_name text,
  creator_id text,
  creator_name text,
  supervisors jsonb not null default '[]'::jsonb,
  due_date date,
  start_date date,
  due_time time,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  location text not null default '',
  location_required boolean not null default false,
  maps_url text,
  geo_coordinates jsonb,
  category text not null default '',
  task_type text,
  task_type_category text check (task_type_category is null or task_type_category in ('administrative','field','financial','visit')),
  client_name text,
  client_contact text,
  client_phone text,
  proof_required text,
  proof_attachment_url text,
  budget numeric(14,2) not null default 0 check (budget >= 0),
  spent_amount numeric(14,2) not null default 0 check (spent_amount >= 0),
  tags text[] not null default '{}',
  fund_id text,
  task_fund_amount numeric(14,2),
  task_fund_spent numeric(14,2),
  task_fund_remaining numeric(14,2),
  notes text,
  time_spent_minutes integer not null default 0 check (time_spent_minutes >= 0),
  is_timer_running boolean not null default false,
  timer_started_at timestamptz,
  is_paused boolean not null default false,
  paused_at timestamptz,
  pause_reason text,
  outcome text check (outcome is null or outcome in ('completed','partially_completed','not_completed','unable_to_execute','needs_followup')),
  outcome_reason text,
  outcome_notes text,
  outcome_submitted_at timestamptz,
  approval_notes text,
  rejection_reason text,
  parent_task_id text,
  chain_follow_up_task_id text,
  task_chain jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, code),
  foreign key (organization_id, parent_task_id) references public.tasks(organization_id, id) on delete set null
);
create index if not exists tasks_org_status_due_idx on public.tasks(organization_id, status, due_date);
create index if not exists tasks_org_assignee_idx on public.tasks(organization_id, assignee_id);

create table if not exists public.task_checklist_items (
  id text not null,
  organization_id uuid not null,
  task_id text not null,
  text text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);
create index if not exists task_checklist_task_idx on public.task_checklist_items(organization_id, task_id, sort_order);

create table if not exists public.task_steps (
  id text not null,
  organization_id uuid not null,
  task_id text not null,
  title text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','blocked','deferred')),
  planned_time text,
  completed_at timestamptz,
  notes text,
  sort_order integer not null default 0,
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);

create table if not exists public.task_subtasks (
  id text not null,
  organization_id uuid not null,
  task_id text not null,
  title text not null,
  assignee_id text,
  assignee_name text not null default '',
  status text not null default 'new',
  requires_approval boolean not null default false,
  is_approved boolean not null default false,
  approved_by_manager boolean not null default false,
  due_date date,
  notes text,
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);

create table if not exists public.task_daily_updates (
  id text not null,
  organization_id uuid not null,
  task_id text not null,
  author_id text,
  author_name text not null default '',
  update_date date not null default current_date,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);

create table if not exists public.task_history (
  id text not null,
  organization_id uuid not null,
  task_id text not null,
  action text not null,
  performed_by text not null default '',
  notes text,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);
create index if not exists task_history_task_created_idx on public.task_history(organization_id, task_id, created_at desc);

create table if not exists public.task_attachments (
  id text not null,
  organization_id uuid not null,
  task_id text not null,
  name text not null,
  url text not null,
  size text not null default '',
  type text not null default 'other',
  uploaded_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);

create table if not exists public.task_comments (
  id text not null,
  organization_id uuid not null,
  task_id text not null,
  author_id text,
  author_name text not null default '',
  author_avatar text,
  author_role text,
  text text not null,
  mentions text[] not null default '{}',
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);

create table if not exists public.funds (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  holder_id text,
  holder_name text not null default '',
  holder_department text not null default '',
  total_allocation numeric(14,2) not null default 0 check (total_allocation >= 0),
  current_balance numeric(14,2) not null default 0,
  spent_balance numeric(14,2) not null default 0,
  currency text not null default 'AED',
  status text not null default 'active' check (status in ('active','warning','depleted','closed')),
  warning_threshold numeric(5,2) not null default 30 check (warning_threshold between 0 and 100),
  last_replenished_date date,
  purpose text not null default '',
  notes text,
  cash_box_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, code)
);
create index if not exists funds_org_status_idx on public.funds(organization_id, status);

create table if not exists public.expenses (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  fund_id text not null,
  amount numeric(14,2) not null check (amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_with_tax numeric(14,2) not null check (total_with_tax >= 0),
  category text not null check (category in ('transport','materials','hospitality','maintenance','government','fuel','tools','other')),
  description text not null default '',
  invoice_number text not null default '',
  vendor_name text not null default '',
  merchant_name text,
  expense_date date,
  receipt_url text,
  has_receipt boolean not null default false,
  status text not null default 'pending_approval' check (status in ('draft','pending_approval','approved','rejected','settled')),
  submitted_by text not null default '',
  submitted_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  task_id text,
  notes text,
  is_deficit boolean not null default false,
  deficit_amount numeric(14,2),
  is_covered_from_cash boolean not null default false,
  covered_at timestamptz,
  covered_by text,
  cascade_split jsonb,
  standing_account_id text,
  standing_direction text check (standing_direction is null or standing_direction in ('receivable','payable','receivable_for_us','payable_by_us')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, code),
  foreign key (organization_id, fund_id) references public.funds(organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete set null
);
create index if not exists expenses_org_status_date_idx on public.expenses(organization_id, status, expense_date desc);
create index if not exists expenses_org_fund_idx on public.expenses(organization_id, fund_id);

create table if not exists public.settlements (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  fund_id text not null,
  holder_name text not null default '',
  period_start date not null,
  period_end date not null,
  advance_amount numeric(14,2) not null default 0,
  total_expenses numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  status text not null default 'under_review' check (status in ('draft','under_review','audited','approved','closed')),
  expenses_count integer not null default 0,
  submitted_at timestamptz not null default now(),
  settled_by text not null default '',
  approved_by text,
  approved_at timestamptz,
  audit_notes text,
  settlement_voucher_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, code),
  foreign key (organization_id, fund_id) references public.funds(organization_id, id),
  check (period_end >= period_start)
);

create table if not exists public.settlement_expenses (
  organization_id uuid not null,
  settlement_id text not null,
  expense_id text not null,
  primary key (organization_id, settlement_id, expense_id),
  foreign key (organization_id, settlement_id) references public.settlements(organization_id, id) on delete cascade,
  foreign key (organization_id, expense_id) references public.expenses(organization_id, id) on delete cascade
);

create table if not exists public.follow_ups (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id text,
  title text not null,
  urgency text not null default 'normal' check (urgency in ('critical','high','normal')),
  assigned_to text not null default '',
  scheduled_date date,
  status text not null default 'pending' check (status in ('pending','resolved','escalated')),
  notes text not null default '',
  last_contact_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete set null
);

create table if not exists public.cash_receipts (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  amount numeric(14,2) not null check (amount >= 0),
  source text not null,
  type text check (type is null or type in ('order_payment','cash_box','purchase_advance','other')),
  received_by text not null default '',
  receipt_date date not null default current_date,
  notes text,
  fund_id text,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, code),
  foreign key (organization_id, fund_id) references public.funds(organization_id, id) on delete set null
);

create table if not exists public.standing_accounts (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  category text not null default '',
  direction text not null check (direction in ('receivable','payable','receivable_for_us','payable_by_us')),
  monthly_limit numeric(14,2),
  default_amount numeric(14,2),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table if not exists public.notifications (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id text,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info','warning','success','alert')),
  is_read boolean not null default false,
  target_view text,
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);
create index if not exists notifications_user_created_idx on public.notifications(organization_id, user_id, created_at desc);

create table if not exists public.audit_logs (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id text,
  user_name text not null default '',
  user_role text not null default 'viewer',
  action text not null,
  action_type text not null check (action_type in ('create','update','delete','approve','reject','settle','auth')),
  entity text not null check (entity in ('task','expense','fund','settlement','user','system')),
  entity_id text not null,
  details text not null default '',
  ip_address inet,
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);
create index if not exists audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- Updated-at maintenance.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations','app_users','roles','tasks','funds','expenses','settlements','follow_ups','standing_accounts'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- SECURITY DEFINER helpers avoid recursive membership-table RLS checks.
create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.auth_user_id = (select auth.uid()) and m.active
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.auth_user_id = (select auth.uid())
      and m.active and m.role = any(allowed_roles)
  );
$$;

-- Enable tenant isolation on every organization-scoped table.
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','app_users','roles','system_settings','tasks','task_checklist_items',
    'task_steps','task_subtasks','task_daily_updates','task_history','task_attachments',
    'task_comments','funds','expenses','settlements','settlement_expenses','follow_ups',
    'cash_receipts','standing_accounts','notifications','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy organization_member_read on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organization_admin_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['admin'])) with check (public.has_org_role(id, array['admin']));

create policy membership_read on public.organization_members for select to authenticated
  using (auth_user_id = (select auth.uid()) or public.has_org_role(organization_id, array['admin']));
create policy membership_admin_manage on public.organization_members for all to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));

create policy app_users_read on public.app_users for select to authenticated
  using (public.is_org_member(organization_id));
create policy app_users_admin_manage on public.app_users for all to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));

create policy roles_member_read on public.roles for select to authenticated
  using (public.is_org_member(organization_id));
create policy roles_admin_manage on public.roles for all to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));

create policy settings_admin_read on public.system_settings for select to authenticated
  using (public.has_org_role(organization_id, array['admin']));
create policy settings_admin_manage on public.system_settings for all to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));

-- Operational records are available to active organization members; fine-grained
-- feature permissions should also be enforced by the application.
do $$
declare t text;
begin
  foreach t in array array[
    'tasks','task_checklist_items','task_steps','task_subtasks','task_daily_updates',
    'task_history','task_attachments','task_comments','follow_ups','notifications'
  ] loop
    execute format('create policy org_member_access on public.%I for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
  end loop;
end $$;

-- Finance data can only be accessed by admins and finance officers.
do $$
declare t text;
begin
  foreach t in array array['funds','expenses','settlements','settlement_expenses','cash_receipts','standing_accounts'] loop
    execute format('create policy finance_role_access on public.%I for all to authenticated using (public.has_org_role(organization_id, array[''admin'',''finance_officer''])) with check (public.has_org_role(organization_id, array[''admin'',''finance_officer'']))', t);
  end loop;
end $$;

create policy audit_read on public.audit_logs for select to authenticated
  using (public.has_org_role(organization_id, array['admin','ops_manager','finance_officer']));
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (public.is_org_member(organization_id));

-- Grant only the normal client roles; service_role keeps Supabase's normal bypass-RLS behavior.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
