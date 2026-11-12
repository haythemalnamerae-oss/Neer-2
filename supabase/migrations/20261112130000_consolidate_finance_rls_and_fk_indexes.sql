-- Consolidate finance SELECT policies without widening access, optimize auth.uid evaluation,
-- and add the two missing composite FK indexes identified by Supabase advisors.

drop policy if exists finance_role_access on public.expenses;
create policy finance_expenses_select on public.expenses
for select to authenticated
using (
  private.has_org_role(organization_id, array['admin','finance_officer']::text[])
  or exists (
    select 1 from public.organization_members m
    where m.organization_id=expenses.organization_id
      and m.auth_user_id=(select auth.uid())
      and m.active and m.role='field_officer'
      and (
        exists (select 1 from public.funds f where f.organization_id=expenses.organization_id and f.id=expenses.fund_id and f.holder_id=m.app_user_id)
        or exists (select 1 from public.tasks t where t.organization_id=expenses.organization_id and t.id=expenses.task_id and t.assignee_id=m.app_user_id)
      )
  )
);
create policy finance_expenses_insert on public.expenses for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
create policy finance_expenses_update on public.expenses for update to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]))
with check (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
create policy finance_expenses_delete on public.expenses for delete to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
drop policy if exists field_assigned_expenses_read on public.expenses;

drop policy if exists finance_role_access on public.funds;
create policy finance_funds_select on public.funds for select to authenticated
using (
  private.has_org_role(organization_id,array['admin','finance_officer']::text[])
  or exists (
    select 1 from public.organization_members m
    where m.organization_id=funds.organization_id
      and m.auth_user_id=(select auth.uid()) and m.active
      and m.role='field_officer' and m.app_user_id=funds.holder_id
  )
);
create policy finance_funds_insert on public.funds for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
create policy finance_funds_update on public.funds for update to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]))
with check (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
create policy finance_funds_delete on public.funds for delete to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
drop policy if exists field_assigned_funds_read on public.funds;

drop policy if exists finance_role_access on public.standing_accounts;
create policy finance_standing_accounts_select on public.standing_accounts for select to authenticated
using (
  private.has_org_role(organization_id,array['admin','finance_officer']::text[])
  or exists (
    select 1 from public.organization_members m
    join public.tasks t on t.organization_id=m.organization_id
      and t.standing_account_id=standing_accounts.id and t.assignee_id=m.app_user_id
    where m.organization_id=standing_accounts.organization_id
      and m.auth_user_id=(select auth.uid()) and m.active and m.role='field_officer'
  )
);
create policy finance_standing_accounts_insert on public.standing_accounts for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
create policy finance_standing_accounts_update on public.standing_accounts for update to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]))
with check (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
create policy finance_standing_accounts_delete on public.standing_accounts for delete to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
drop policy if exists standing_accounts_scoped_read on public.standing_accounts;

drop policy if exists standing_entries_finance_read on public.standing_account_entries;
drop policy if exists standing_entries_scoped_read on public.standing_account_entries;
create policy standing_entries_scoped_read on public.standing_account_entries
for select to authenticated using (
  private.has_org_role(organization_id,array['admin','finance_officer']::text[])
  or exists (
    select 1 from public.organization_members m
    join public.tasks t on t.organization_id=m.organization_id
      and t.standing_account_id=standing_account_entries.standing_account_id
      and t.assignee_id=m.app_user_id
    where m.organization_id=standing_account_entries.organization_id
      and m.auth_user_id=(select auth.uid()) and m.active and m.role='field_officer'
  )
);

drop policy if exists fund_transactions_finance_insert on public.fund_transactions;
create policy fund_transactions_finance_insert on public.fund_transactions
for insert to authenticated with check (
  private.has_org_role(organization_id,array['admin','finance_officer']::text[])
  and created_by=(select auth.uid())
);
drop policy if exists standing_entries_finance_insert on public.standing_account_entries;
create policy standing_entries_finance_insert on public.standing_account_entries
for insert to authenticated with check (
  private.has_org_role(organization_id,array['admin','finance_officer']::text[])
  and created_by=(select auth.uid())
);

create index if not exists standing_entries_org_expense_fk_idx
  on public.standing_account_entries (organization_id, expense_id);
create index if not exists standing_entries_org_fund_fk_idx
  on public.standing_account_entries (organization_id, fund_id);
