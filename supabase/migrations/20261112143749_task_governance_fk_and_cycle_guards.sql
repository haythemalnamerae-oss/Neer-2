-- Correct nullable-column behavior for tenant-composite foreign keys and prevent step dependency cycles.
-- Additive integrity/security hardening. No business or financial rows are changed.
alter table public.tasks drop constraint if exists tasks_org_task_type_key_fkey;
alter table public.tasks add constraint tasks_org_task_type_key_fkey
  foreign key (organization_id,task_type_key)
  references public.task_types(organization_id,key)
  on update cascade on delete set null (task_type_key) not valid;
alter table public.tasks validate constraint tasks_org_task_type_key_fkey;

alter table public.tasks drop constraint if exists tasks_org_task_request_fkey;
alter table public.tasks add constraint tasks_org_task_request_fkey
  foreign key (organization_id,task_request_id)
  references public.task_requests(organization_id,id)
  on delete set null (task_request_id) not valid;
alter table public.tasks validate constraint tasks_org_task_request_fkey;

alter table public.tasks drop constraint if exists tasks_org_requested_by_fkey;
alter table public.tasks add constraint tasks_org_requested_by_fkey
  foreign key (organization_id,requested_by)
  references public.app_users(organization_id,id)
  on delete set null (requested_by) not valid;
alter table public.tasks validate constraint tasks_org_requested_by_fkey;

alter table public.task_steps drop constraint if exists task_steps_org_assignee_fkey;
alter table public.task_steps add constraint task_steps_org_assignee_fkey
  foreign key (organization_id,assigned_to)
  references public.app_users(organization_id,id)
  on delete set null (assigned_to) not valid;
alter table public.task_steps validate constraint task_steps_org_assignee_fkey;

alter table public.task_steps drop constraint if exists task_steps_org_dependency_fkey;
alter table public.task_steps add constraint task_steps_org_dependency_fkey
  foreign key (organization_id,depends_on_step_id)
  references public.task_steps(organization_id,id)
  on delete set null (depends_on_step_id) not valid;
alter table public.task_steps validate constraint task_steps_org_dependency_fkey;

alter table public.task_subtasks drop constraint if exists task_subtasks_org_assignee_fkey;
alter table public.task_subtasks add constraint task_subtasks_org_assignee_fkey
  foreign key (organization_id,assignee_id)
  references public.app_users(organization_id,id)
  on delete set null (assignee_id) not valid;
alter table public.task_subtasks validate constraint task_subtasks_org_assignee_fkey;

create or replace function private.guard_task_step_dependency_cycle()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if new.depends_on_step_id is null then return new; end if;
  if new.depends_on_step_id = new.id then
    raise exception using errcode='22023',message='A task step cannot depend on itself';
  end if;
  if not exists (
    select 1 from public.task_steps s
    where s.organization_id=new.organization_id
      and s.task_id=new.task_id
      and s.id=new.depends_on_step_id
  ) then
    raise exception using errcode='23503',message='Step dependency must belong to the same task';
  end if;
  if exists (
    with recursive dependency_chain(id,depends_on_step_id) as (
      select s.id,s.depends_on_step_id
      from public.task_steps s
      where s.organization_id=new.organization_id
        and s.task_id=new.task_id
        and s.id=new.depends_on_step_id
      union
      select s.id,s.depends_on_step_id
      from public.task_steps s
      join dependency_chain d on s.id=d.depends_on_step_id
      where s.organization_id=new.organization_id and s.task_id=new.task_id
    )
    select 1 from dependency_chain where id=new.id
  ) then
    raise exception using errcode='23514',message='Task step dependency would create a cycle';
  end if;
  return new;
end;
$$;
drop trigger if exists task_steps_dependency_cycle_guard on public.task_steps;
create trigger task_steps_dependency_cycle_guard
before insert or update of depends_on_step_id,task_id,organization_id on public.task_steps
for each row execute function private.guard_task_step_dependency_cycle();

create or replace function private.guard_field_step_configuration()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id=new.organization_id
      and m.auth_user_id=auth.uid() and m.active
      and m.role='field_officer'
  ) and (
    new.assigned_to is distinct from old.assigned_to
    or new.depends_on_step_id is distinct from old.depends_on_step_id
    or new.approval_required is distinct from old.approval_required
  ) then
    raise exception using errcode='42501',message='Field officers cannot reconfigure task-step ownership, dependencies or approval rules';
  end if;
  return new;
end;
$$;
drop trigger if exists task_steps_field_configuration_guard on public.task_steps;
create trigger task_steps_field_configuration_guard
before update on public.task_steps
for each row execute function private.guard_field_step_configuration();
