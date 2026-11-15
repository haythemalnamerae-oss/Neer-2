-- Cover the two task foreign keys reported by Supabase's performance advisor.
-- Additive indexes only; no data or existing index is changed.
create index if not exists tasks_org_requested_by_fk_idx
  on public.tasks (organization_id, requested_by);

create index if not exists tasks_org_task_type_key_fk_idx
  on public.tasks (organization_id, task_type_key);
