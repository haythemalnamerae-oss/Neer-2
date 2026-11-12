-- Structured field-visit foundation.
-- Additive only: preserves existing operational and financial rows.
begin;

alter table public.standing_accounts
  add column if not exists vendor_name text,
  add column if not exists contact_phone text,
  add column if not exists address text,
  add column if not exists image_url text,
  add column if not exists reference_image_url text,
  add column if not exists account_type text,
  add column if not exists currency text,
  add column if not exists opening_balance numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'standing_accounts_account_type_check'
      and conrelid = 'public.standing_accounts'::regclass
  ) then
    alter table public.standing_accounts
      add constraint standing_accounts_account_type_check
      check (account_type is null or account_type in ('grocery','vendor','transport','hospitality','utility','maintenance','other'));
  end if;
end $$;

alter table public.tasks
  add column if not exists standing_account_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_org_standing_account_fk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_org_standing_account_fk
      foreign key (organization_id, standing_account_id)
      references public.standing_accounts (organization_id, id)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists tasks_org_standing_account_idx
  on public.tasks (organization_id, standing_account_id)
  where standing_account_id is not null;

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id text not null,
  standing_account_id text,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'visit_started','visit_paused','visit_resumed','visit_completed',
    'task_started','task_paused','task_resumed','task_completed',
    'subtask_created','expense_recorded','invoice_attached',
    'follow_up_scheduled','note_added','status_changed','location_unavailable'
  )),
  event_label text not null default '',
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  location_status text not null check (location_status in (
    'captured','permission_denied','services_disabled','unavailable','timeout','not_requested'
  )),
  client_event_id uuid not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  constraint task_events_location_pair_check
    check ((latitude is null) = (longitude is null)),
  constraint task_events_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint task_events_longitude_check
    check (longitude is null or longitude between -180 and 180),
  constraint task_events_accuracy_check
    check (accuracy_meters is null or accuracy_meters >= 0),
  constraint task_events_location_consistency_check
    check (
      (location_status = 'captured' and latitude is not null and longitude is not null)
      or (location_status <> 'captured' and latitude is null and longitude is null)
    ),
  constraint task_events_org_client_event_unique unique (organization_id, client_event_id),
  constraint task_events_task_fk
    foreign key (organization_id, task_id)
    references public.tasks (organization_id, id) on delete restrict,
  constraint task_events_account_fk
    foreign key (organization_id, standing_account_id)
    references public.standing_accounts (organization_id, id) on delete restrict
);

create index if not exists task_events_org_task_time_idx
  on public.task_events (organization_id, task_id, occurred_at desc);
create index if not exists task_events_org_actor_time_idx
  on public.task_events (organization_id, actor_auth_user_id, occurred_at desc);
create index if not exists task_events_org_account_time_idx
  on public.task_events (organization_id, standing_account_id, occurred_at desc)
  where standing_account_id is not null;

create or replace function private.reject_task_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'task_events is append-only; events cannot be updated or deleted'
    using errcode = '55000';
end;
$$;

drop trigger if exists task_events_append_only on public.task_events;
create trigger task_events_append_only
  before update or delete on public.task_events
  for each row execute function private.reject_task_event_mutation();

alter table public.task_events enable row level security;
revoke all on table public.task_events from anon, public;
grant select, insert on table public.task_events to authenticated;
revoke update, delete, truncate, references, trigger on table public.task_events from authenticated;

drop policy if exists task_events_member_read on public.task_events;
create policy task_events_member_read
  on public.task_events for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists task_events_actor_insert on public.task_events;
create policy task_events_actor_insert
  on public.task_events for insert to authenticated
  with check (
    actor_auth_user_id = (select auth.uid())
    and private.is_org_member(organization_id)
    and exists (
      select 1
      from public.organization_members m
      join public.tasks t
        on t.organization_id = m.organization_id
       and t.id = task_events.task_id
      where m.organization_id = task_events.organization_id
        and m.auth_user_id = (select auth.uid())
        and m.active
        and (
          m.role in ('admin','ops_manager','finance_officer')
          or (m.role = 'field_officer' and t.assignee_id = m.app_user_id)
        )
    )
  );

grant usage on schema public to authenticated;

commit;
