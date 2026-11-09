-- Atomic finance workflows: append-only ledgers and server-owned balance transitions.
-- Existing financial rows and balances are intentionally left unchanged.
create table if not exists public.fund_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fund_id text not null,
  transaction_type text not null check (transaction_type in ('expense_approval','replenishment','cash_receipt','settlement_close','adjustment')),
  amount numeric(14,2) not null check (amount > 0),
  balance_delta numeric(14,2) not null,
  reference_type text,
  reference_id text,
  description text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  idempotency_key uuid not null,
  unique (organization_id, idempotency_key),
  foreign key (organization_id, fund_id) references public.funds(organization_id,id)
);
create index if not exists fund_transactions_fund_date_idx
  on public.fund_transactions(organization_id,fund_id,created_at desc);

create table if not exists public.standing_account_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  standing_account_id text not null,
  task_id text,
  fund_id text,
  expense_id text,
  entry_type text not null check (entry_type in ('charge','payment','advance','collection')),
  amount numeric(14,2) not null check (amount > 0),
  balance_effect numeric(14,2) not null,
  currency text not null default 'AED',
  entry_date date not null default current_date,
  description text not null default '',
  reference text,
  invoice_image_url text,
  ocr_data jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  idempotency_key uuid not null,
  unique (organization_id,idempotency_key),
  foreign key (organization_id,standing_account_id) references public.standing_accounts(organization_id,id),
  foreign key (organization_id,task_id) references public.tasks(organization_id,id) on delete set null,
  foreign key (organization_id,fund_id) references public.funds(organization_id,id),
  foreign key (organization_id,expense_id) references public.expenses(organization_id,id)
);
create index if not exists standing_entries_account_date_idx
  on public.standing_account_entries(organization_id,standing_account_id,entry_date desc);
create index if not exists standing_entries_task_idx
  on public.standing_account_entries(organization_id,task_id,created_at desc);

alter table public.fund_transactions enable row level security;
alter table public.standing_account_entries enable row level security;
revoke all on public.fund_transactions, public.standing_account_entries from public, anon;
grant select on public.fund_transactions, public.standing_account_entries to authenticated;
drop policy if exists fund_transactions_finance_read on public.fund_transactions;
drop policy if exists fund_transactions_finance_read on public.fund_transactions;
create policy fund_transactions_finance_read on public.fund_transactions
  for select to authenticated using (private.has_org_role(organization_id,array['admin','finance_officer']));
drop policy if exists fund_transactions_finance_insert on public.fund_transactions;
create policy fund_transactions_finance_insert on public.fund_transactions
  for insert to authenticated with check (private.has_org_role(organization_id,array['admin','finance_officer']) and created_by=auth.uid());
grant insert on public.fund_transactions to authenticated;
drop policy if exists standing_entries_finance_read on public.standing_account_entries;
drop policy if exists standing_entries_finance_read on public.standing_account_entries;
create policy standing_entries_finance_read on public.standing_account_entries
  for select to authenticated using (private.has_org_role(organization_id,array['admin','finance_officer']));
drop policy if exists standing_entries_finance_insert on public.standing_account_entries;
create policy standing_entries_finance_insert on public.standing_account_entries
  for insert to authenticated with check (private.has_org_role(organization_id,array['admin','finance_officer']) and created_by=auth.uid());
grant insert on public.standing_account_entries to authenticated;

alter table public.expenses add column if not exists idempotency_key uuid;
create unique index if not exists expenses_org_idempotency_uidx
  on public.expenses(organization_id,idempotency_key) where idempotency_key is not null;

create or replace function public.finance_create_expense(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_expense public.expenses%rowtype; v_id text; v_code text;
begin
  if not private.has_org_role(p_org,array['admin','finance_officer']) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency is null or coalesce((p_payload->>'amount')::numeric,0) <= 0 then raise exception 'INVALID_EXPENSE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':expense:' || p_idempotency::text,0));
  select * into v_expense from public.expenses where organization_id=p_org and idempotency_key=p_idempotency;
  if found then return to_jsonb(v_expense); end if;
  select * into v_fund from public.funds where organization_id=p_org and id=p_payload->>'fund_id' for update;
  if not found then raise exception 'FUND_NOT_FOUND'; end if;
  v_id := 'exp-' || replace(gen_random_uuid()::text,'-','');
  v_code := 'EXP-' || to_char(current_date,'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.expenses(id,organization_id,code,fund_id,amount,tax_amount,total_with_tax,category,description,invoice_number,vendor_name,merchant_name,expense_date,receipt_url,has_receipt,status,submitted_by,task_id,notes,standing_account_id,standing_direction,idempotency_key)
  values(v_id,p_org,v_code,v_fund.id,(p_payload->>'amount')::numeric,coalesce((p_payload->>'tax_amount')::numeric,0),
    (p_payload->>'amount')::numeric+coalesce((p_payload->>'tax_amount')::numeric,0),p_payload->>'category',
    coalesce(p_payload->>'description',''),coalesce(p_payload->>'invoice_number',''),coalesce(p_payload->>'vendor_name',''),
    p_payload->>'merchant_name',nullif(p_payload->>'expense_date','')::date,p_payload->>'receipt_url',
    coalesce((p_payload->>'has_receipt')::boolean,false),'pending_approval',
    coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),''),
    p_payload->>'task_id',p_payload->>'notes',p_payload->>'standing_account_id',p_payload->>'standing_direction',p_idempotency)
  returning * into v_expense;
  insert into public.audit_logs(organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values(p_org,(select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),
    coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),''),'finance_officer',
    'تسجيل مصروف','create','expense',v_id,'تم تسجيل المصروف بانتظار الاعتماد؛ لم يُخصم من العهدة بعد.');
  return to_jsonb(v_expense);
end $finance$;

create or replace function public.finance_review_expense(p_org uuid,p_expense_id text,p_approve boolean,p_reason text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $finance$
declare v_exp public.expenses%rowtype; v_fund public.funds%rowtype; v_name text;
begin
  if not private.has_org_role(p_org,array['admin','finance_officer']) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_exp from public.expenses where organization_id=p_org and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;
  if v_exp.status <> 'pending_approval' then raise exception 'EXPENSE_NOT_PENDING'; end if;
  select name into v_name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1;
  if p_approve then
    select * into v_fund from public.funds where organization_id=p_org and id=v_exp.fund_id for update;
    if v_fund.current_balance < v_exp.total_with_tax then raise exception 'INSUFFICIENT_FUND_BALANCE'; end if;
    update public.funds set current_balance=current_balance-v_exp.total_with_tax,
      spent_balance=spent_balance+v_exp.total_with_tax,
      status=case when current_balance-v_exp.total_with_tax <= 0 then 'depleted'
        when ((current_balance-v_exp.total_with_tax)/nullif(total_allocation,0))*100 <= warning_threshold then 'warning' else 'active' end
      where organization_id=p_org and id=v_exp.fund_id;
    update public.expenses set status='approved',approved_by=coalesce(v_name,'مستخدم النظام'),approved_at=now(),updated_at=now()
      where organization_id=p_org and id=p_expense_id returning * into v_exp;
    insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,reference_type,reference_id,description,idempotency_key)
    values(p_org,v_exp.fund_id,'expense_approval',v_exp.total_with_tax,-v_exp.total_with_tax,'expense',v_exp.id,'خصم مصروف معتمد: '||v_exp.code,gen_random_uuid());
  else
    update public.expenses set status='rejected',rejection_reason=coalesce(nullif(p_reason,''),'مرفوض'),updated_at=now()
      where organization_id=p_org and id=p_expense_id returning * into v_exp;
  end if;
  insert into public.audit_logs(organization_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values(p_org,coalesce(v_name,''),'finance_officer',case when p_approve then 'اعتماد مصروف' else 'رفض مصروف' end,
    case when p_approve then 'approve' else 'reject' end,'expense',v_exp.id,coalesce(p_reason,''));
  return to_jsonb(v_exp);
end $finance$;

create or replace function public.finance_replenish_fund(p_org uuid,p_fund_id text,p_amount numeric,p_notes text,p_idempotency uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_tx public.fund_transactions%rowtype;
begin
  if not private.has_org_role(p_org,array['admin','finance_officer']) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_amount <= 0 or p_idempotency is null then raise exception 'INVALID_REPLENISHMENT'; end if;
  select * into v_tx from public.fund_transactions where organization_id=p_org and idempotency_key=p_idempotency;
  if found then select * into v_fund from public.funds where organization_id=p_org and id=v_tx.fund_id; return jsonb_build_object('fund',to_jsonb(v_fund),'transaction',to_jsonb(v_tx)); end if;
  select * into v_fund from public.funds where organization_id=p_org and id=p_fund_id for update;
  if not found then raise exception 'FUND_NOT_FOUND'; end if;
  update public.funds set current_balance=current_balance+p_amount,total_allocation=total_allocation+p_amount,
    status='active',last_replenished_date=current_date,updated_at=now()
    where organization_id=p_org and id=p_fund_id returning * into v_fund;
  insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,description,idempotency_key)
  values(p_org,p_fund_id,'replenishment',p_amount,p_amount,coalesce(p_notes,'تغذية عهدة'),p_idempotency) returning * into v_tx;
  return jsonb_build_object('fund',to_jsonb(v_fund),'transaction',to_jsonb(v_tx));
end $finance$;

create or replace function public.finance_create_standing_entry(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $finance$
declare v_account public.standing_accounts%rowtype; v_entry public.standing_account_entries%rowtype; v_effect numeric;
begin
  if not private.has_org_role(p_org,array['admin','finance_officer']) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency is null or coalesce((p_payload->>'amount')::numeric,0) <= 0 then raise exception 'INVALID_STANDING_ENTRY'; end if;
  select * into v_entry from public.standing_account_entries where organization_id=p_org and idempotency_key=p_idempotency;
  if found then return to_jsonb(v_entry); end if;
  select * into v_account from public.standing_accounts where organization_id=p_org and id=p_payload->>'standing_account_id' and active for update;
  if not found then raise exception 'STANDING_ACCOUNT_NOT_FOUND'; end if;
  if p_payload->>'entry_type' not in ('charge','payment','advance','collection') then raise exception 'INVALID_ENTRY_TYPE'; end if;
  v_effect := case when p_payload->>'entry_type'='charge' then (p_payload->>'amount')::numeric else -(p_payload->>'amount')::numeric end;
  insert into public.standing_account_entries(organization_id,standing_account_id,task_id,fund_id,expense_id,entry_type,amount,balance_effect,currency,entry_date,description,reference,invoice_image_url,ocr_data,idempotency_key)
  values(p_org,v_account.id,p_payload->>'task_id',p_payload->>'fund_id',p_payload->>'expense_id',p_payload->>'entry_type',
    (p_payload->>'amount')::numeric,v_effect,coalesce(nullif(p_payload->>'currency',''),v_account.currency,'AED'),
    coalesce(nullif(p_payload->>'entry_date','')::date,current_date),coalesce(p_payload->>'description',''),p_payload->>'reference',
    p_payload->>'invoice_image_url',p_payload->'ocr_data',p_idempotency) returning * into v_entry;
  return to_jsonb(v_entry);
end $finance$;

create or replace function public.finance_create_settlement(p_org uuid,p_fund_id text,p_period_start date,p_period_end date,p_expense_ids text[],p_idempotency uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_settlement public.settlements%rowtype; v_ids text[]; v_total numeric; v_count integer; v_id text;
begin
  if not private.has_org_role(p_org,array['admin','finance_officer']) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency is null or p_period_end < p_period_start then raise exception 'INVALID_SETTLEMENT_PERIOD'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':settlement:'||p_idempotency::text,0));
  select id into v_id from public.settlements where organization_id=p_org and code='IDEMP-'||p_idempotency::text;
  if v_id is not null then select * into v_settlement from public.settlements where organization_id=p_org and id=v_id; return to_jsonb(v_settlement); end if;
  select * into v_fund from public.funds where organization_id=p_org and id=p_fund_id for update;
  if not found then raise exception 'FUND_NOT_FOUND'; end if;
  select coalesce(array_agg(e.id order by e.id),array[]::text[]),coalesce(sum(e.total_with_tax),0),count(*)
    into v_ids,v_total,v_count
    from public.expenses e
    where e.organization_id=p_org and e.fund_id=p_fund_id and e.status='approved'
      and e.expense_date between p_period_start and p_period_end
      and (p_expense_ids is null or cardinality(p_expense_ids)=0 or e.id=any(p_expense_ids))
      and not exists(select 1 from public.settlement_expenses se where se.organization_id=p_org and se.expense_id=e.id);
  if v_count=0 or (p_expense_ids is not null and cardinality(p_expense_ids)>0 and v_count<>cardinality(p_expense_ids)) then raise exception 'EXPENSES_UNAVAILABLE_OR_ALREADY_SETTLED'; end if;
  v_id := 'stl-'||replace(gen_random_uuid()::text,'-','');
  insert into public.settlements(id,organization_id,code,fund_id,holder_name,period_start,period_end,advance_amount,total_expenses,remaining_amount,status,expenses_count,settled_by)
  values(v_id,p_org,'IDEMP-'||p_idempotency::text,p_fund_id,v_fund.holder_name,p_period_start,p_period_end,v_fund.total_allocation,v_total,v_fund.current_balance,'under_review',v_count,
    coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'')) returning * into v_settlement;
  insert into public.settlement_expenses(organization_id,settlement_id,expense_id)
    select p_org,v_id,unnest(v_ids);
  return to_jsonb(v_settlement);
end $finance$;

create or replace function public.finance_close_settlement(p_org uuid,p_settlement_id text,p_approve boolean,p_notes text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $finance$
declare v_settlement public.settlements%rowtype; v_name text;
begin
  if not private.has_org_role(p_org,array['admin','finance_officer']) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_settlement from public.settlements where organization_id=p_org and id=p_settlement_id for update;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  if v_settlement.status not in ('under_review','audited') then raise exception 'SETTLEMENT_NOT_REVIEWABLE'; end if;
  select name into v_name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1;
  if p_approve then
    update public.expenses e set status='settled',updated_at=now()
      where e.organization_id=p_org and exists(select 1 from public.settlement_expenses se where se.organization_id=p_org and se.settlement_id=p_settlement_id and se.expense_id=e.id);
    update public.settlements set status='closed',approved_by=coalesce(v_name,'مستخدم النظام'),approved_at=now(),audit_notes=coalesce(p_notes,audit_notes),updated_at=now()
      where organization_id=p_org and id=p_settlement_id returning * into v_settlement;
  else
    delete from public.settlement_expenses where organization_id=p_org and settlement_id=p_settlement_id;
    update public.settlements set status='draft',audit_notes=coalesce(p_notes,audit_notes),updated_at=now()
      where organization_id=p_org and id=p_settlement_id returning * into v_settlement;
  end if;
  return to_jsonb(v_settlement);
end $finance$;

revoke all on function public.finance_create_expense(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_review_expense(uuid,text,boolean,text) from public,anon;
revoke all on function public.finance_replenish_fund(uuid,text,numeric,text,uuid) from public,anon;
revoke all on function public.finance_create_standing_entry(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_create_settlement(uuid,text,date,date,text[],uuid) from public,anon;
revoke all on function public.finance_close_settlement(uuid,text,boolean,text) from public,anon;
grant execute on function public.finance_create_expense(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_review_expense(uuid,text,boolean,text) to authenticated;
grant execute on function public.finance_replenish_fund(uuid,text,numeric,text,uuid) to authenticated;
grant execute on function public.finance_create_standing_entry(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_create_settlement(uuid,text,date,date,text[],uuid) to authenticated;
grant execute on function public.finance_close_settlement(uuid,text,boolean,text) to authenticated;
