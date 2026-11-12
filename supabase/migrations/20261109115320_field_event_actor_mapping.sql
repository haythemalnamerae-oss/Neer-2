-- Resolve the field user's operational identity from either the explicit
-- membership mapping or the organization user directory.
drop policy if exists task_events_actor_insert on public.task_events;
create policy task_events_actor_insert
  on public.task_events for insert to authenticated
  with check (
    actor_auth_user_id = (select auth.uid())
    and private.is_org_member(organization_id)
    and exists (
      select 1
      from public.organization_members m
      join public.tasks t
        on t.organization_id = m.organization_id
       and t.id = task_events.task_id
      where m.organization_id = task_events.organization_id
        and m.auth_user_id = (select auth.uid())
        and m.active
        and (
          m.role in ('admin','ops_manager','finance_officer')
          or (
            m.role = 'field_officer'
            and (
              t.assignee_id = m.app_user_id
              or exists (
                select 1 from public.app_users u
                where u.organization_id = m.organization_id
                  and u.auth_user_id = m.auth_user_id
                  and u.id = t.assignee_id
                  and u.active
              )
            )
          )
        )
    )
  );
