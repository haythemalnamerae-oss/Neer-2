-- Allow periodic foreground GPS samples during an active field visit.
alter table public.task_events
  drop constraint if exists task_events_event_type_check;
alter table public.task_events
  add constraint task_events_event_type_check
  check (event_type in (
    'visit_started','visit_paused','visit_resumed','visit_completed',
    'task_started','task_paused','task_resumed','task_completed',
    'subtask_created','expense_recorded','invoice_attached',
    'follow_up_scheduled','note_added','status_changed',
    'location_unavailable','location_sample'
  ));
