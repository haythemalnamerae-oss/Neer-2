begin;

alter table public.expenses
  add column if not exists submitted_by_auth_user_id uuid;

comment on column public.expenses.submitted_by_auth_user_id is
  'Authenticated Supabase user who submitted the expense; NULL is retained for historical records created before this field existed.';

create or replace function public.expenses_capture_submitter()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  new.submitted_by_auth_user_id := auth.uid();
  return new;
end;
$fn$;

drop trigger if exists expenses_capture_submitter on public.expenses;
create trigger expenses_capture_submitter
before insert on public.expenses
for each row execute function public.expenses_capture_submitter();

create or replace function public.finance_review_expense(
  p_org uuid,
  p_expense_id text,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_exp public.expenses%rowtype;
  v_fund public.funds%rowtype;
  v_account public.standing_accounts%rowtype;
  v_name text;
  v_user text;
  v_role text;
  v_key uuid;
begin
  perform private.assert_finance_org_access(p_org);

  select * into v_exp
  from public.expenses
  where organization_id = p_org and id = p_expense_id
  for update;

  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;
  if v_exp.status <> 'pending_approval' then raise exception 'EXPENSE_NOT_PENDING'; end if;

  select au.id, au.name, om.role
    into v_user, v_name, v_role
  from public.app_users au
  join public.organization_members om
    on om.organization_id = au.organization_id
   and om.app_user_id = au.id
   and om.auth_user_id = auth.uid()
   and om.active = true
  where au.organization_id = p_org
    and au.auth_user_id = auth.uid()
  limit 1;

  if v_role is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  if v_exp.submitted_by_auth_user_id is not null
     and v_exp.submitted_by_auth_user_id = auth.uid() then
    raise exception 'MAKER_CANNOT_APPROVE_OWN_EXPENSE' using errcode = '42501';
  end if;

  v_name := coalesce(v_name, 'مستخدم النظام');

  if p_approve then
    if v_exp.special_audit_required and coalesce(trim(p_reason), '') = '' then
      raise exception 'SPECIAL_AUDIT_NOTE_REQUIRED';
    end if;

    if v_exp.standing_account_id is not null then
      select * into v_account
      from public.standing_accounts
      where organization_id = p_org
        and id = v_exp.standing_account_id
        and active
      for update;

      if not found or v_account.direction not in ('payable','payable_by_us') then
        raise exception 'SUPPLIER_ACCOUNT_NOT_AVAILABLE';
      end if;

      if exists (
        select 1 from public.standing_account_entries e
        where e.organization_id = p_org
          and e.standing_account_id = v_account.id
          and lower(trim(coalesce(e.reference,''))) = lower(trim(v_exp.invoice_number))
          and e.expense_id is distinct from v_exp.id
      ) then
        raise exception 'DUPLICATE_SUPPLIER_INVOICE_REFERENCE';
      end if;

      v_key := md5(p_org::text || ':expense-standing:' || v_exp.id)::uuid;

      insert into public.standing_account_entries(
        organization_id, standing_account_id, expense_id, entry_type,
        amount, balance_effect, currency, entry_date, description,
        reference, idempotency_key
      )
      values(
        p_org, v_account.id, v_exp.id, 'charge',
        v_exp.total_with_tax, v_exp.total_with_tax,
        coalesce(v_account.currency, 'AED'),
        coalesce(v_exp.expense_date, current_date),
        v_exp.description, coalesce(nullif(v_exp.invoice_number,''),v_exp.code),
        v_key
      )
      on conflict (organization_id, idempotency_key) do nothing;
    else
      select * into v_fund
      from public.funds
      where organization_id = p_org and id = v_exp.fund_id
      for update;

      if not found or v_fund.current_balance < v_exp.total_with_tax then
        raise exception 'INSUFFICIENT_FUND_BALANCE';
      end if;

      update public.funds
      set current_balance = current_balance - v_exp.total_with_tax,
          spent_balance = spent_balance + v_exp.total_with_tax,
          status = case
            when current_balance - v_exp.total_with_tax <= 0 then 'depleted'
            when total_allocation > 0
              and ((current_balance - v_exp.total_with_tax) / total_allocation) * 100 <= warning_threshold then 'warning'
            else 'active'
          end,
          updated_at = now()
      where organization_id = p_org and id = v_exp.fund_id;

      insert into public.fund_transactions(
        organization_id, fund_id, transaction_type, amount, balance_delta,
        reference_type, reference_id, description, idempotency_key
      )
      values(
        p_org, v_exp.fund_id, 'expense_approval', v_exp.total_with_tax,
        -v_exp.total_with_tax, 'expense', v_exp.id,
        'خصم مصروف معتمد: ' || v_exp.code,
        md5(p_org::text || ':expense-fund:' || v_exp.id)::uuid
      )
      on conflict (organization_id, idempotency_key) do nothing;
    end if;

    update public.expenses
    set status = 'approved',
        approved_by = v_name,
        approved_at = now(),
        approval_notes = nullif(trim(p_reason),''),
        updated_at = now()
    where organization_id = p_org and id = p_expense_id
    returning * into v_exp;
  else
    if coalesce(trim(p_reason),'') = '' then
      raise exception 'REJECTION_REASON_REQUIRED';
    end if;

    update public.expenses
    set status = 'rejected',
        rejection_reason = trim(p_reason),
        updated_at = now()
    where organization_id = p_org and id = p_expense_id
    returning * into v_exp;
  end if;

  insert into public.audit_logs(
    id, organization_id, user_id, user_name, user_role,
    action, action_type, entity, entity_id, details
  )
  values(
    'aud-' || replace(gen_random_uuid()::text,'-',''),
    p_org, v_user, v_name, v_role,
    case when p_approve then 'اعتماد مصروف' else 'رفض مصروف' end,
    case when p_approve then 'approve' else 'reject' end,
    'expense', v_exp.id, coalesce(p_reason,'')
  );

  return to_jsonb(v_exp);
end;
$fn$;

commit;
