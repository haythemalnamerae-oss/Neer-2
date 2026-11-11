-- Normalized task collaborators and private task attachment storage.
-- Schema-only migration; no existing operational or financial records are rewritten.
create table if not exists public.task_assignees (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id text not null,
  app_user_id text not null,
  assigned_by text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint task_assignees_task_fk foreign key (organization_id, task_id)
    references public.tasks(organization_id, id) on delete cascade,
  constraint task_assignees_user_fk foreign key (organization_id, app_user_id)
    references public.app_users(organization_id, id) on delete restrict,
  constraint task_assignees_unique_user unique (organization_id, task_id, app_user_id)
);

create unique index if not exists task_assignees_one_primary_idx
  on public.task_assignees(organization_id, task_id) where is_primary;
create index if not exists task_assignees_user_task_idx
  on public.task_assignees(organization_id, app_user_id, task_id);

alter table public.task_assignees enable row level security;
drop policy if exists task_assignees_scoped_select on public.task_assignees;
drop policy if exists task_assignees_scoped_insert on public.task_assignees;
drop policy if exists task_assignees_scoped_update on public.task_assignees;
drop policy if exists task_assignees_scoped_delete on public.task_assignees;
create policy task_assignees_scoped_select on public.task_assignees
for select to authenticated
using (private.can_access_task(organization_id, task_id, 'view'));
create policy task_assignees_scoped_insert on public.task_assignees
for insert to authenticated
with check (private.can_access_task(organization_id, task_id, 'edit'));
create policy task_assignees_scoped_update on public.task_assignees
for update to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'))
with check (private.can_access_task(organization_id, task_id, 'edit'));
create policy task_assignees_scoped_delete on public.task_assignees
for delete to authenticated
using (private.can_access_task(organization_id, task_id, 'edit'));

create or replace function private.sync_primary_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then
    return new;
  end if;

  update public.task_assignees
  set is_primary = false
  where organization_id = new.organization_id and task_id = new.id and is_primary;

  if new.assignee_id is not null then
    insert into public.task_assignees (
      id, organization_id, task_id, app_user_id, assigned_by, is_primary
    ) values (
      'primary-' || new.id, new.organization_id, new.id, new.assignee_id,
      new.creator_id, true
    )
    on conflict (organization_id, task_id, app_user_id)
    do update set is_primary = true, assigned_by = excluded.assigned_by;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_sync_primary_assignee on public.tasks;
create trigger tasks_sync_primary_assignee
after insert or update of assignee_id on public.tasks
for each row execute function private.sync_primary_task_assignee();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists task_attachments_object_select on storage.objects;
drop policy if exists task_attachments_object_insert on storage.objects;
drop policy if exists task_attachments_object_delete on storage.objects;

create policy task_attachments_object_select on storage.objects
for select to authenticated
using (
  case
    when bucket_id = 'task-attachments'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and coalesce((storage.foldername(name))[2], '') <> ''
    then private.can_access_task(((storage.foldername(name))[1])::uuid, (storage.foldername(name))[2], 'view')
    else false
  end
);

create policy task_attachments_object_insert on storage.objects
for insert to authenticated
with check (
  case
    when bucket_id = 'task-attachments'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and coalesce((storage.foldername(name))[2], '') <> ''
    then private.can_access_task(((storage.foldername(name))[1])::uuid, (storage.foldername(name))[2], 'edit')
    else false
  end
);

create policy task_attachments_object_delete on storage.objects
for delete to authenticated
using (
  case
    when bucket_id = 'task-attachments'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and coalesce((storage.foldername(name))[2], '') <> ''
    then private.can_access_task(((storage.foldername(name))[1])::uuid, (storage.foldername(name))[2], 'delete')
    else false
  end
);
