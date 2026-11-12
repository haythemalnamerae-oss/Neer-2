-- Financial records are mutated only through SECURITY DEFINER transactional RPC workflows.
-- Remove direct authenticated table writes; keep scoped SELECT policies.
drop policy if exists finance_expenses_insert on public.expenses;
drop policy if exists finance_expenses_update on public.expenses;
drop policy if exists finance_expenses_delete on public.expenses;

drop policy if exists finance_funds_insert on public.funds;
drop policy if exists finance_funds_update on public.funds;
drop policy if exists finance_funds_delete on public.funds;

drop policy if exists finance_standing_accounts_insert on public.standing_accounts;
drop policy if exists finance_standing_accounts_update on public.standing_accounts;
drop policy if exists finance_standing_accounts_delete on public.standing_accounts;

drop policy if exists fund_transactions_finance_insert on public.fund_transactions;
drop policy if exists standing_entries_finance_insert on public.standing_account_entries;

drop policy if exists finance_role_access on public.cash_receipts;
create policy finance_cash_receipts_select on public.cash_receipts
for select to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));

drop policy if exists finance_role_access on public.settlements;
create policy finance_settlements_select on public.settlements
for select to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));

drop policy if exists finance_role_access on public.settlement_expenses;
create policy finance_settlement_expenses_select on public.settlement_expenses
for select to authenticated
using (private.has_org_role(organization_id,array['admin','finance_officer']::text[]));
