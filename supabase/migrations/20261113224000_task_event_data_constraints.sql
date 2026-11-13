-- Enforce event label and GPS accuracy bounds at the table boundary as defense in depth.
-- A preflight query found zero existing rows, so these constraints are safe to validate.
alter table public.task_events
  add constraint task_events_accuracy_upper_check
  check (accuracy_meters is null or accuracy_meters <= 100000);

alter table public.task_events
  add constraint task_events_event_label_length_check
  check (length(btrim(event_label)) between 1 and 200);
