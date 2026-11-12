-- Field staff can read only their assigned cash funds and expenses they submitted or belong to those funds.
drop policy if exists field_assigned_funds_read on public.funds;
create policy field_assigned_funds_read on public.funds
for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=funds.organization_id and m.auth_user_id=auth.uid()
      and m.active=true and m.role='field_officer' and m.app_user_id=funds.holder_id
  )
);
drop policy if exists field_related_expenses_read on public.expenses;
create policy field_related_expenses_read on public.expenses
for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id
    where m.organization_id=expenses.organization_id and m.auth_user_id=auth.uid()
      and m.active=true and m.role='field_officer'
      and (
        expenses.submitted_by=u.name
        or exists(select 1 from public.funds f where f.organization_id=expenses.organization_id and f.id=expenses.fund_id and f.holder_id=m.app_user_id)
      )
  )
);
drop policy if exists org_member_standing_accounts_read on public.standing_accounts;
create policy org_member_standing_accounts_read on public.standing_accounts
for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists org_member_standing_entries_read on public.standing_account_entries;
create policy org_member_standing_entries_read on public.standing_account_entries
for select to authenticated using (private.is_org_member(organization_id));
