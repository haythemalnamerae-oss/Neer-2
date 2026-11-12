-- Complete server-owned finance mutations and close direct-table write paths.
-- No existing financial rows are rewritten or backfilled.
create or replace function private.assert_finance_org_access(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.auth_user_id = auth.uid()
      and m.active = true and m.role in ('admin','finance_officer')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$guard$;
revoke all on function private.assert_finance_org_access(uuid) from public, anon;
grant execute on function private.assert_finance_org_access(uuid) to authenticated;

-- Direct REST writes are disabled; all financial changes must pass through atomic RPCs.
revoke insert, update, delete, truncate, references, trigger on
  public.funds, public.expenses, public.settlements, public.settlement_expenses,
  public.cash_receipts, public.standing_accounts, public.fund_transactions,
  public.standing_account_entries from anon, authenticated;
grant select on
  public.funds, public.expenses, public.settlements, public.settlement_expenses,
  public.cash_receipts, public.standing_accounts, public.fund_transactions,
  public.standing_account_entries to authenticated;

-- Ledgers are append-only even if another code path is accidentally granted write access.
create or replace function private.reject_finance_ledger_mutation()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  raise exception 'FINANCE_LEDGER_APPEND_ONLY' using errcode = '55000';
end;
$guard$;
drop trigger if exists fund_transactions_append_only on public.fund_transactions;
create trigger fund_transactions_append_only before update or delete on public.fund_transactions
for each row execute function private.reject_finance_ledger_mutation();
drop trigger if exists standing_account_entries_append_only on public.standing_account_entries;
create trigger standing_account_entries_append_only before update or delete on public.standing_account_entries
for each row execute function private.reject_finance_ledger_mutation();

-- Settlement reservation is unique per expense; rejected settlements release their reservations.
create unique index if not exists settlement_expenses_one_active_reservation
  on public.settlement_expenses(organization_id,expense_id);
alter table public.settlements add column if not exists audited_by text;
alter table public.settlements add column if not exists audited_by_auth_user_id uuid;
alter table public.settlements add column if not exists audited_at timestamptz;
alter table public.settlements drop constraint if exists settlements_status_check;
alter table public.settlements add constraint settlements_status_check
  check (status = any(array['draft','under_review','audited','approved','closed','rejected']));

create or replace function public.finance_create_fund(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_id text; v_code text; v_user text;
begin
  perform private.assert_finance_org_access(p_org);
  if p_idempotency is null or coalesce(trim(p_payload->>'name'),'')='' or
     coalesce((p_payload->>'total_allocation')::numeric,0)<=0 then raise exception 'INVALID_FUND'; end if;
  v_user := coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() and active limit 1),'');
  if coalesce(p_payload->>'holder_id','')='' or not exists(select 1 from public.app_users where organization_id=p_org and id=p_payload->>'holder_id' and active) then raise exception 'FUND_HOLDER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':fund:'||p_idempotency::text,0));
  select * into v_fund from public.funds where organization_id=p_org and code='IDEMP-'||p_idempotency::text;
  if found then return to_jsonb(v_fund); end if;
  v_id := 'fund-'||replace(gen_random_uuid()::text,'-','');
  v_code := 'PCF-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.funds(id,organization_id,name,code,holder_id,holder_name,holder_department,total_allocation,current_balance,spent_balance,currency,status,warning_threshold,last_replenished_date,purpose,notes,cash_box_balance)
  values(v_id,p_org,trim(p_payload->>'name'),'IDEMP-'||p_idempotency::text,p_payload->>'holder_id',
    (select name from public.app_users where organization_id=p_org and id=p_payload->>'holder_id'),
    coalesce((select department from public.app_users where organization_id=p_org and id=p_payload->>'holder_id'),''),
    (p_payload->>'total_allocation')::numeric,(p_payload->>'total_allocation')::numeric,0,
    coalesce(nullif(p_payload->>'currency',''),'AED'),'active',
    coalesce((p_payload->>'warning_threshold')::numeric,30),current_date,
    coalesce(p_payload->>'purpose',''),p_payload->>'notes',0) returning * into v_fund;
  update public.funds set code=v_code where organization_id=p_org and id=v_id returning * into v_fund;
  insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,description,idempotency_key)
  values(p_org,v_id,'adjustment',v_fund.total_allocation,v_fund.total_allocation,'تخصيص أولي للعهدة',md5(p_org::text||':fund-opening:'||v_id)::uuid);
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,
    (select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),
    v_user,'admin','إنشاء عهدة','create','fund',v_id,'تخصيص عهدة جديدة بقيمة '||v_fund.total_allocation);
  return to_jsonb(v_fund);
end;
$finance$;

create or replace function public.finance_create_standing_account(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_account public.standing_accounts%rowtype; v_id text; v_direction text;
begin
  perform private.assert_finance_org_access(p_org);
  if p_idempotency is null or coalesce(trim(p_payload->>'name'),'')='' then raise exception 'INVALID_STANDING_ACCOUNT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':standing-account:'||p_idempotency::text,0));
  select * into v_account from public.standing_accounts where organization_id=p_org and code='IDEMP-'||p_idempotency::text;
  if found then return to_jsonb(v_account); end if;
  v_direction := coalesce(p_payload->>'direction','payable');
  if v_direction not in ('payable','payable_by_us','receivable','receivable_for_us') then raise exception 'INVALID_ACCOUNT_DIRECTION'; end if;
  if coalesce((p_payload->>'opening_balance')::numeric,0)<0 then raise exception 'INVALID_OPENING_BALANCE'; end if;
  v_id := 'std-'||replace(gen_random_uuid()::text,'-','');
  insert into public.standing_accounts(organization_id,id,code,name,category,direction,monthly_limit,default_amount,notes,active,vendor_name,contact_phone,address,image_url,reference_image_url,account_type,currency,opening_balance)
  values(p_org,v_id,'IDEMP-'||p_idempotency::text,trim(p_payload->>'name'),coalesce(p_payload->>'category','other'),v_direction,
    nullif(p_payload->>'monthly_limit','')::numeric,nullif(p_payload->>'default_amount','')::numeric,p_payload->>'notes',true,
    nullif(p_payload->>'vendor_name',''),nullif(p_payload->>'contact_phone',''),nullif(p_payload->>'address',''),
    nullif(p_payload->>'image_url',''),nullif(p_payload->>'reference_image_url',''),p_payload->>'account_type',
    coalesce(nullif(p_payload->>'currency',''),'AED'),coalesce((p_payload->>'opening_balance')::numeric,0))
  returning * into v_account;
  update public.standing_accounts set code='STD-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
    where organization_id=p_org and id=v_id returning * into v_account;
  return to_jsonb(v_account);
end;
$finance$;

create or replace function public.finance_create_expense(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_expense public.expenses%rowtype; v_account public.standing_accounts%rowtype;
  v_id text; v_code text; v_amount numeric; v_tax numeric; v_task text; v_account_id text; v_user text;
begin
  perform private.assert_finance_org_access(p_org);
  v_amount := coalesce((p_payload->>'amount')::numeric,0);
  v_tax := coalesce((p_payload->>'tax_amount')::numeric,0);
  if p_idempotency is null or v_amount<=0 or v_tax<0 or coalesce(trim(p_payload->>'description'),'')='' or
     coalesce(trim(p_payload->>'vendor_name'),'')='' or coalesce(trim(p_payload->>'category'),'') not in
     ('transport','materials','hospitality','maintenance','government','fuel','tools','other') then raise exception 'INVALID_EXPENSE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':expense:'||p_idempotency::text,0));
  select * into v_expense from public.expenses where organization_id=p_org and idempotency_key=p_idempotency;
  if found then return to_jsonb(v_expense); end if;
  select * into v_fund from public.funds where organization_id=p_org and id=p_payload->>'fund_id' for update;
  if not found or v_fund.status='closed' then raise exception 'FUND_NOT_FOUND_OR_CLOSED'; end if;
  v_task := nullif(p_payload->>'task_id','');
  if v_task is not null and not exists(select 1 from public.tasks where organization_id=p_org and id=v_task) then raise exception 'TASK_NOT_FOUND'; end if;
  v_account_id := nullif(p_payload->>'standing_account_id','');
  if v_account_id is not null then
    select * into v_account from public.standing_accounts where organization_id=p_org and id=v_account_id and active for update;
    if not found or v_account.direction not in ('payable','payable_by_us') or coalesce(v_account.currency,'AED')<>v_fund.currency then raise exception 'INVALID_SUPPLIER_ACCOUNT'; end if;
    if p_payload ? 'cascade_deduction' or p_payload ? 'allow_deficit' then raise exception 'SUPPLIER_CREDIT_CANNOT_SPLIT_OR_DEFICIT'; end if;
  end if;
  if coalesce(trim(p_payload->>'invoice_number'),'')<>'' and exists(
    select 1 from public.expenses e where e.organization_id=p_org and e.status<>'rejected'
      and lower(trim(e.invoice_number))=lower(trim(p_payload->>'invoice_number'))
      and lower(trim(e.vendor_name))=lower(trim(p_payload->>'vendor_name'))
  ) then raise exception 'DUPLICATE_VENDOR_INVOICE'; end if;
  v_id := 'exp-'||replace(gen_random_uuid()::text,'-','');
  v_code := 'EXP-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  v_user := coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'');
  insert into public.expenses(id,organization_id,code,fund_id,amount,tax_amount,total_with_tax,category,description,invoice_number,vendor_name,merchant_name,expense_date,receipt_url,has_receipt,status,submitted_by,task_id,notes,standing_account_id,standing_direction,idempotency_key)
  values(v_id,p_org,v_code,v_fund.id,v_amount,v_tax,v_amount+v_tax,p_payload->>'category',
    trim(p_payload->>'description'),coalesce(p_payload->>'invoice_number',''),trim(p_payload->>'vendor_name'),
    nullif(p_payload->>'merchant_name',''),coalesce(nullif(p_payload->>'expense_date','')::date,current_date),
    nullif(p_payload->>'receipt_url',''),coalesce((p_payload->>'has_receipt')::boolean,false),'pending_approval',
    v_user,v_task,p_payload->>'notes',v_account_id,case when v_account_id is null then null else v_account.direction end,p_idempotency)
  returning * into v_expense;
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,
    (select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),
    v_user,'finance_officer','تسجيل مصروف','create','expense',v_id,'تم تسجيل المصروف بانتظار الاعتماد دون خصم العهدة.');
  return to_jsonb(v_expense);
end;
$finance$;

create or replace function public.finance_review_expense(p_org uuid,p_expense_id text,p_approve boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_exp public.expenses%rowtype; v_fund public.funds%rowtype; v_account public.standing_accounts%rowtype; v_name text; v_user text; v_key uuid;
begin
  perform private.assert_finance_org_access(p_org);
  select * into v_exp from public.expenses where organization_id=p_org and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;
  if v_exp.status<>'pending_approval' then raise exception 'EXPENSE_NOT_PENDING'; end if;
  v_name := coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'مستخدم النظام');
  v_user := (select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1);
  if p_approve then
    if v_exp.standing_account_id is not null then
      select * into v_account from public.standing_accounts where organization_id=p_org and id=v_exp.standing_account_id and active for update;
      if not found or v_account.direction not in ('payable','payable_by_us') then raise exception 'SUPPLIER_ACCOUNT_NOT_AVAILABLE'; end if;
      if exists(select 1 from public.standing_account_entries e where e.organization_id=p_org and e.standing_account_id=v_account.id and lower(trim(coalesce(e.reference,'')))=lower(trim(v_exp.invoice_number)) and e.expense_id is distinct from v_exp.id) then raise exception 'DUPLICATE_SUPPLIER_INVOICE_REFERENCE'; end if;
      v_key := md5(p_org::text||':expense-standing:'||v_exp.id)::uuid;
      insert into public.standing_account_entries(organization_id,standing_account_id,expense_id,entry_type,amount,balance_effect,currency,entry_date,description,reference,idempotency_key)
      values(p_org,v_account.id,v_exp.id,'charge',v_exp.total_with_tax,v_exp.total_with_tax,
        coalesce(v_account.currency,'AED'),coalesce(v_exp.expense_date,current_date),v_exp.description,
        coalesce(nullif(v_exp.invoice_number,''),v_exp.code),v_key)
      on conflict (organization_id,idempotency_key) do nothing;
    else
      select * into v_fund from public.funds where organization_id=p_org and id=v_exp.fund_id for update;
      if not found or v_fund.current_balance<v_exp.total_with_tax then raise exception 'INSUFFICIENT_FUND_BALANCE'; end if;
      update public.funds set current_balance=current_balance-v_exp.total_with_tax,
        spent_balance=spent_balance+v_exp.total_with_tax,
        status=case when current_balance-v_exp.total_with_tax<=0 then 'depleted'
          when total_allocation>0 and ((current_balance-v_exp.total_with_tax)/total_allocation)*100<=warning_threshold then 'warning' else 'active' end,
        updated_at=now()
        where organization_id=p_org and id=v_exp.fund_id;
      insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,reference_type,reference_id,description,idempotency_key)
      values(p_org,v_exp.fund_id,'expense_approval',v_exp.total_with_tax,-v_exp.total_with_tax,'expense',v_exp.id,
        'خصم مصروف معتمد: '||v_exp.code,md5(p_org::text||':expense-fund:'||v_exp.id)::uuid)
      on conflict (organization_id,idempotency_key) do nothing;
    end if;
    update public.expenses set status='approved',approved_by=v_name,approved_at=now(),updated_at=now()
      where organization_id=p_org and id=p_expense_id returning * into v_exp;
  else
    if coalesce(trim(p_reason),'')='' then raise exception 'REJECTION_REASON_REQUIRED'; end if;
    update public.expenses set status='rejected',rejection_reason=trim(p_reason),updated_at=now()
      where organization_id=p_org and id=p_expense_id returning * into v_exp;
  end if;
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,v_user,v_name,'finance_officer',
    case when p_approve then 'اعتماد مصروف' else 'رفض مصروف' end,
    case when p_approve then 'approve' else 'reject' end,'expense',v_exp.id,coalesce(p_reason,''));
  return to_jsonb(v_exp);
end;
$finance$;

create or replace function public.finance_replenish_fund(p_org uuid,p_fund_id text,p_amount numeric,p_notes text,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_tx public.fund_transactions%rowtype;
begin
  perform private.assert_finance_org_access(p_org);
  if p_amount<=0 or p_idempotency is null then raise exception 'INVALID_REPLENISHMENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':replenish:'||p_idempotency::text,0));
  select * into v_tx from public.fund_transactions where organization_id=p_org and idempotency_key=p_idempotency;
  if found then select * into v_fund from public.funds where organization_id=p_org and id=v_tx.fund_id; return jsonb_build_object('fund',to_jsonb(v_fund),'transaction',to_jsonb(v_tx)); end if;
  select * into v_fund from public.funds where organization_id=p_org and id=p_fund_id for update;
  if not found or v_fund.status='closed' then raise exception 'FUND_NOT_FOUND_OR_CLOSED'; end if;
  update public.funds set current_balance=current_balance+p_amount,total_allocation=total_allocation+p_amount,
    status=case when current_balance+p_amount<=0 then 'depleted' when total_allocation+p_amount>0 and ((current_balance+p_amount)/(total_allocation+p_amount))*100<=warning_threshold then 'warning' else 'active' end,
    last_replenished_date=current_date,updated_at=now()
    where organization_id=p_org and id=p_fund_id returning * into v_fund;
  insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,description,idempotency_key)
  values(p_org,p_fund_id,'replenishment',p_amount,p_amount,coalesce(p_notes,'تغذية عهدة'),p_idempotency) returning * into v_tx;
  return jsonb_build_object('fund',to_jsonb(v_fund),'transaction',to_jsonb(v_tx));
end;
$finance$;

create or replace function public.finance_create_cash_receipt(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_receipt public.cash_receipts%rowtype; v_fund public.funds%rowtype; v_id text; v_user text;
begin
  perform private.assert_finance_org_access(p_org);
  if p_idempotency is null or coalesce((p_payload->>'amount')::numeric,0)<=0 or coalesce(trim(p_payload->>'source'),'')='' then raise exception 'INVALID_CASH_RECEIPT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':cash-receipt:'||p_idempotency::text,0));
  select * into v_receipt from public.cash_receipts where organization_id=p_org and code='IDEMP-'||p_idempotency::text;
  if found then return to_jsonb(v_receipt); end if;
  if coalesce(p_payload->>'type','other')='cash_box' then
    select * into v_fund from public.funds where organization_id=p_org and id=p_payload->>'fund_id' for update;
    if not found then raise exception 'FUND_NOT_FOUND'; end if;
    update public.funds set cash_box_balance=cash_box_balance+(p_payload->>'amount')::numeric,updated_at=now()
      where organization_id=p_org and id=v_fund.id returning * into v_fund;
  end if;
  v_id := 'cr-'||replace(gen_random_uuid()::text,'-','');
  v_user := coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'');
  insert into public.cash_receipts(id,organization_id,code,amount,source,type,received_by,receipt_date,notes,fund_id)
  values(v_id,p_org,'IDEMP-'||p_idempotency::text,(p_payload->>'amount')::numeric,trim(p_payload->>'source'),
    coalesce(p_payload->>'type','other'),v_user,coalesce(nullif(p_payload->>'receipt_date','')::date,current_date),
    p_payload->>'notes',case when p_payload->>'type'='cash_box' then p_payload->>'fund_id' else null end)
  returning * into v_receipt;
  update public.cash_receipts set code='REC-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
    where organization_id=p_org and id=v_id returning * into v_receipt;
  return to_jsonb(v_receipt);
end;
$finance$;

create or replace function public.finance_create_standing_entry(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_account public.standing_accounts%rowtype; v_entry public.standing_account_entries%rowtype; v_effect numeric;
begin
  perform private.assert_finance_org_access(p_org);
  if p_idempotency is null or coalesce((p_payload->>'amount')::numeric,0)<=0 then raise exception 'INVALID_STANDING_ENTRY'; end if;
  select * into v_entry from public.standing_account_entries where organization_id=p_org and idempotency_key=p_idempotency;
  if found then return to_jsonb(v_entry); end if;
  select * into v_account from public.standing_accounts where organization_id=p_org and id=p_payload->>'standing_account_id' and active for update;
  if not found then raise exception 'STANDING_ACCOUNT_NOT_FOUND'; end if;
  if p_payload->>'entry_type' not in ('charge','payment','advance','collection') then raise exception 'INVALID_ENTRY_TYPE'; end if;
  v_effect := case when p_payload->>'entry_type'='charge' then (p_payload->>'amount')::numeric else -(p_payload->>'amount')::numeric end;
  insert into public.standing_account_entries(organization_id,standing_account_id,task_id,fund_id,expense_id,entry_type,amount,balance_effect,currency,entry_date,description,reference,invoice_image_url,ocr_data,idempotency_key)
  values(p_org,v_account.id,nullif(p_payload->>'task_id',''),nullif(p_payload->>'fund_id',''),nullif(p_payload->>'expense_id',''),p_payload->>'entry_type',
    (p_payload->>'amount')::numeric,v_effect,coalesce(nullif(p_payload->>'currency',''),v_account.currency,'AED'),
    coalesce(nullif(p_payload->>'entry_date','')::date,current_date),coalesce(p_payload->>'description',''),p_payload->>'reference',
    p_payload->>'invoice_image_url',p_payload->'ocr_data',p_idempotency) returning * into v_entry;
  return to_jsonb(v_entry);
end;
$finance$;

create or replace function public.finance_settle_standing_account(p_org uuid,p_account_id text,p_amount numeric,p_fund_id text,p_entry_date date,p_reference text,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_account public.standing_accounts%rowtype; v_fund public.funds%rowtype; v_entry public.standing_account_entries%rowtype;
  v_balance numeric; v_payable boolean; v_type text; v_receipt_id text;
begin
  perform private.assert_finance_org_access(p_org);
  if p_amount<=0 or p_idempotency is null or coalesce(trim(p_reference),'')='' then raise exception 'INVALID_ACCOUNT_SETTLEMENT'; end if;
  select * into v_entry from public.standing_account_entries where organization_id=p_org and idempotency_key=p_idempotency;
  if found then return to_jsonb(v_entry); end if;
  select * into v_account from public.standing_accounts where organization_id=p_org and id=p_account_id for update;
  if not found then raise exception 'STANDING_ACCOUNT_NOT_FOUND'; end if;
  select coalesce(v_account.opening_balance,0)+coalesce(sum(e.balance_effect),0) into v_balance
    from public.standing_account_entries e where e.organization_id=p_org and e.standing_account_id=p_account_id;
  if p_amount>v_balance then raise exception 'SETTLEMENT_EXCEEDS_ACCOUNT_BALANCE'; end if;
  v_payable := v_account.direction in ('payable','payable_by_us');
  select * into v_fund from public.funds where organization_id=p_org and id=p_fund_id for update;
  if not found or v_fund.currency<>coalesce(v_account.currency,'AED') then raise exception 'INVALID_SETTLEMENT_FUND_OR_CURRENCY'; end if;
  if v_payable then
    if v_fund.current_balance<p_amount then raise exception 'INSUFFICIENT_FUND_BALANCE'; end if;
    v_type := 'payment';
    update public.funds set current_balance=current_balance-p_amount,spent_balance=spent_balance+p_amount,
      status=case when current_balance-p_amount<=0 then 'depleted' when total_allocation>0 and ((current_balance-p_amount)/total_allocation)*100<=warning_threshold then 'warning' else 'active' end,
      updated_at=now() where organization_id=p_org and id=p_fund_id;
    insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,reference_type,reference_id,description,idempotency_key)
    values(p_org,p_fund_id,'settlement_close',p_amount,-p_amount,'standing_account',p_account_id,'سداد حساب: '||v_account.name,md5(p_org::text||':standing-payment:'||p_idempotency::text)::uuid);
  else
    v_type := 'collection';
    update public.funds set cash_box_balance=cash_box_balance+p_amount,updated_at=now() where organization_id=p_org and id=p_fund_id;
    v_receipt_id := 'cr-'||replace(gen_random_uuid()::text,'-','');
    insert into public.cash_receipts(id,organization_id,code,amount,source,type,received_by,receipt_date,notes,fund_id)
    values(v_receipt_id,p_org,'REC-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
      p_amount,'تحصيل من حساب '||v_account.name,'cash_box',
      coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),''),
      coalesce(p_entry_date,current_date),p_reference,p_fund_id);
  end if;
  insert into public.standing_account_entries(organization_id,standing_account_id,fund_id,entry_type,amount,balance_effect,currency,entry_date,description,reference,idempotency_key)
  values(p_org,p_account_id,p_fund_id,v_type,p_amount,-p_amount,coalesce(v_account.currency,'AED'),coalesce(p_entry_date,current_date),
    case when v_payable then 'سداد للمورد' else 'تحصيل من الطرف المدين' end,p_reference,p_idempotency) returning * into v_entry;
  return to_jsonb(v_entry);
end;
$finance$;

create or replace function public.finance_create_settlement(p_org uuid,p_fund_id text,p_period_start date,p_period_end date,p_expense_ids text[],p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_settlement public.settlements%rowtype; v_ids text[]; v_total numeric; v_count integer; v_id text;
begin
  perform private.assert_finance_org_access(p_org);
  if p_idempotency is null or p_period_end<p_period_start then raise exception 'INVALID_SETTLEMENT_PERIOD'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':settlement:'||p_idempotency::text,0));
  select * into v_settlement from public.settlements where organization_id=p_org and code='IDEMP-'||p_idempotency::text;
  if found then return to_jsonb(v_settlement); end if;
  select * into v_fund from public.funds where organization_id=p_org and id=p_fund_id for update;
  if not found then raise exception 'FUND_NOT_FOUND'; end if;
  perform 1 from public.expenses e where e.organization_id=p_org and e.fund_id=p_fund_id and e.status='approved'
    and e.expense_date between p_period_start and p_period_end
    and (p_expense_ids is null or cardinality(p_expense_ids)=0 or e.id=any(p_expense_ids))
    order by e.id for update;
  select coalesce(array_agg(e.id order by e.id),array[]::text[]),coalesce(sum(e.total_with_tax),0),count(*)
    into v_ids,v_total,v_count from public.expenses e
    where e.organization_id=p_org and e.fund_id=p_fund_id and e.status='approved'
      and e.expense_date between p_period_start and p_period_end
      and (p_expense_ids is null or cardinality(p_expense_ids)=0 or e.id=any(p_expense_ids))
      and not exists(select 1 from public.settlement_expenses se where se.organization_id=p_org and se.expense_id=e.id);
  if v_count=0 or (p_expense_ids is not null and cardinality(p_expense_ids)>0 and v_count<>cardinality(p_expense_ids)) then raise exception 'EXPENSES_UNAVAILABLE_OR_ALREADY_SETTLED'; end if;
  v_id := 'stl-'||replace(gen_random_uuid()::text,'-','');
  insert into public.settlements(id,organization_id,code,fund_id,holder_name,period_start,period_end,advance_amount,total_expenses,remaining_amount,status,expenses_count,settled_by)
  values(v_id,p_org,'IDEMP-'||p_idempotency::text,p_fund_id,v_fund.holder_name,p_period_start,p_period_end,v_fund.total_allocation,v_total,v_fund.current_balance,'under_review',v_count,
    coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'')) returning * into v_settlement;
  insert into public.settlement_expenses(organization_id,settlement_id,expense_id) select p_org,v_id,unnest(v_ids);
  return to_jsonb(v_settlement);
end;
$finance$;

create or replace function public.finance_review_settlement(p_org uuid,p_settlement_id text,p_action text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_settlement public.settlements%rowtype; v_name text; v_uid uuid;
begin
  perform private.assert_finance_org_access(p_org);
  if p_action not in ('audit','approve','reject') then raise exception 'INVALID_SETTLEMENT_ACTION'; end if;
  select * into v_settlement from public.settlements where organization_id=p_org and id=p_settlement_id for update;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  v_uid := auth.uid();
  v_name := coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=v_uid limit 1),'مستخدم النظام');
  if p_action='audit' then
    if v_settlement.status<>'under_review' then raise exception 'SETTLEMENT_NOT_AUDITABLE'; end if;
    update public.settlements set status='audited',audited_by=v_name,audited_by_auth_user_id=v_uid,audited_at=now(),
      audit_notes=coalesce(p_notes,audit_notes),updated_at=now()
      where organization_id=p_org and id=p_settlement_id returning * into v_settlement;
  elsif p_action='approve' then
    if v_settlement.status<>'audited' or v_settlement.audited_by_auth_user_id=v_uid then raise exception 'SECOND_APPROVER_REQUIRED'; end if;
    update public.expenses e set status='settled',updated_at=now()
      where e.organization_id=p_org and exists(select 1 from public.settlement_expenses se where se.organization_id=p_org and se.settlement_id=p_settlement_id and se.expense_id=e.id);
    update public.settlements set status='closed',approved_by=v_name,approved_at=now(),audit_notes=coalesce(p_notes,audit_notes),updated_at=now()
      where organization_id=p_org and id=p_settlement_id returning * into v_settlement;
  else
    if v_settlement.status not in ('under_review','audited') then raise exception 'SETTLEMENT_NOT_REJECTABLE'; end if;
    delete from public.settlement_expenses where organization_id=p_org and settlement_id=p_settlement_id;
    update public.settlements set status='rejected',audit_notes=coalesce(p_notes,audit_notes),updated_at=now()
      where organization_id=p_org and id=p_settlement_id returning * into v_settlement;
  end if;
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,
    (select id from public.app_users where organization_id=p_org and auth_user_id=v_uid limit 1),v_name,'finance_officer',
    case p_action when 'audit' then 'تدقيق تسوية' when 'approve' then 'اعتماد تسوية' else 'رفض تسوية' end,
    p_action,'settlement',p_settlement_id,coalesce(p_notes,''));
  return to_jsonb(v_settlement);
end;
$finance$;

revoke all on function public.finance_create_fund(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_create_standing_account(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_create_expense(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_review_expense(uuid,text,boolean,text) from public,anon;
revoke all on function public.finance_replenish_fund(uuid,text,numeric,text,uuid) from public,anon;
revoke all on function public.finance_create_cash_receipt(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_create_standing_entry(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_settle_standing_account(uuid,text,numeric,text,date,text,uuid) from public,anon;
revoke all on function public.finance_create_settlement(uuid,text,date,date,text[],uuid) from public,anon;
revoke all on function public.finance_review_settlement(uuid,text,text,text) from public,anon;
grant execute on function public.finance_create_fund(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_create_standing_account(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_create_expense(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_review_expense(uuid,text,boolean,text) to authenticated;
grant execute on function public.finance_replenish_fund(uuid,text,numeric,text,uuid) to authenticated;
grant execute on function public.finance_create_cash_receipt(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_create_standing_entry(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_settle_standing_account(uuid,text,numeric,text,date,text,uuid) to authenticated;
grant execute on function public.finance_create_settlement(uuid,text,date,date,text[],uuid) to authenticated;
grant execute on function public.finance_review_settlement(uuid,text,text,text) to authenticated;
