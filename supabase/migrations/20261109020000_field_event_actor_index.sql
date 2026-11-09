-- Cover the actor foreign key and direct actor history lookups.
create index if not exists task_events_actor_auth_user_fk_idx
  on public.task_events (actor_auth_user_id);
