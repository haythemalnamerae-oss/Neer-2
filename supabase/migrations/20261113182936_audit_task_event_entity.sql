-- The task-event audit trigger writes entity='task_event'. Permit that
-- explicit ledger entity instead of failing every event insert at the audit constraint.
-- This changes schema validation only; no audit, task, event or finance rows are rewritten.
alter table public.audit_logs
  drop constraint if exists audit_logs_entity_check;

alter table public.audit_logs
  add constraint audit_logs_entity_check
  check (entity = any (array['task','task_event','expense','fund','settlement','user','system']::text[]));
