-- Limit field-role visibility to records linked to the assigned field workload.
-- Finance roles retain their existing finance_role_access policies.

drop policy if exists field_related_expenses_read on public.expenses;
create policy field_assigned_expenses_read
on public.expenses
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = expenses.organization_id
      and m.auth_user_id = (select auth.uid())
      and m.active = true
      and m.role = 'field_officer'
      and (
        exists (
          select 1 from public.funds f
          where f.organization_id = expenses.organization_id
            and f.id = expenses.fund_id
            and f.holder_id = m.app_user_id
        )
        or exists (
          select 1 from public.tasks t
          where t.organization_id = expenses.organization_id
            and t.id = expenses.task_id
            and t.assignee_id = m.app_user_id
        )
      )
  )
);

drop policy if exists org_member_standing_accounts_read on public.standing_accounts;
create policy standing_accounts_scoped_read
on public.standing_accounts
for select
to authenticated
using (
  private.has_org_role(organization_id, array['admin','finance_officer'])
  or exists (
    select 1
    from public.organization_members m
    join public.tasks t
      on t.organization_id = m.organization_id
     and t.standing_account_id = standing_accounts.id
     and t.assignee_id = m.app_user_id
    where m.organization_id = standing_accounts.organization_id
      and m.auth_user_id = (select auth.uid())
      and m.active = true
      and m.role = 'field_officer'
  )
);

drop policy if exists org_member_standing_entries_read on public.standing_account_entries;
create policy standing_entries_scoped_read
on public.standing_account_entries
for select
to authenticated
using (
  private.has_org_role(organization_id, array['admin','finance_officer'])
  or exists (
    select 1
    from public.organization_members m
    join public.tasks t
      on t.organization_id = m.organization_id
     and t.standing_account_id = standing_account_entries.standing_account_id
     and t.assignee_id = m.app_user_id
    where m.organization_id = standing_account_entries.organization_id
      and m.auth_user_id = (select auth.uid())
      and m.active = true
      and m.role = 'field_officer'
  )
);
