-- Do not move a task to a terminal/approval state while any employee still has an open time session.
-- Session start/stop RPCs lock the task row, so this guard serializes with session creation.
create or replace function private.guard_task_terminal_time_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_sessions integer;
begin
  if new.status is distinct from old.status
     and new.status in ('pending_approval','completed','approved','rejected','deferred','cancelled') then
    select count(*)::integer
      into v_open_sessions
    from public.task_time_sessions s
    where s.organization_id = new.organization_id
      and s.task_id = new.id
      and s.status in ('active','paused');

    if v_open_sessions > 0 then
      raise exception using
        errcode = '55000',
        message = 'يجب على جميع الموظفين إيقاف جلسات الوقت المفتوحة قبل إنهاء المهمة أو إرسالها للاعتماد.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_task_terminal_time_sessions() from public, anon, authenticated;

drop trigger if exists tasks_guard_open_time_sessions on public.tasks;
create trigger tasks_guard_open_time_sessions
before update of status on public.tasks
for each row
execute function private.guard_task_terminal_time_sessions();
