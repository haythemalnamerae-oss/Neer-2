-- Restrict direct access to the private outcome idempotency table.
-- The only discovered application reference is record_task_outcome_bundle,
-- a SECURITY DEFINER function owned by postgres. No direct table grants or
-- policies exist for anon/authenticated; the function remains owner-authorized.
ALTER TABLE private.task_outcome_requests ENABLE ROW LEVEL SECURITY;
