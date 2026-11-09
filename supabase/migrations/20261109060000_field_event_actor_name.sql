-- Preserve the actor display name at event time so history remains readable
-- even if a user profile is later renamed or directory access is restricted.
alter table public.task_events
  add column if not exists actor_name text not null default '';

create or replace function private.set_task_event_actor_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select u.name into new.actor_name
  from public.app_users u
  where u.organization_id = new.organization_id
    and u.auth_user_id = (select auth.uid())
  limit 1;
  if new.actor_name is null or btrim(new.actor_name) = '' then
    new.actor_name := 'مستخدم النظام';
  end if;
  return new;
end;
$$;

drop trigger if exists task_events_actor_name on public.task_events;
create trigger task_events_actor_name
  before insert on public.task_events
  for each row execute function private.set_task_event_actor_name();

revoke all on function private.set_task_event_actor_name() from public, anon, authenticated;
