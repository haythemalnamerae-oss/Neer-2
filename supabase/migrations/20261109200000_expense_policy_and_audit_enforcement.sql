-- Server-side VAT, invoice policy and audit-threshold enforcement.
alter table public.expenses add column if not exists approval_notes text;
alter table public.expenses add column if not exists special_audit_required boolean not null default false;

create or replace function public.finance_create_expense(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare
 v_fund public.funds%rowtype; v_expense public.expenses%rowtype; v_account public.standing_accounts%rowtype;
 v_id text; v_code text; v_amount numeric; v_tax numeric; v_tax_rate numeric; v_task text; v_account_id text;
 v_user text; v_settings jsonb; v_single_limit numeric; v_month_total numeric; v_special boolean;
 v_invoice_required boolean; v_receipt_required boolean; v_expense_date date;
begin
 v_amount:=coalesce((p_payload->>'amount')::numeric,0);
 if p_idempotency is null or v_amount<=0 or coalesce(trim(p_payload->>'description'),'')='' or
  coalesce(trim(p_payload->>'vendor_name'),'')='' or coalesce(trim(p_payload->>'category'),'') not in
  ('transport','materials','hospitality','maintenance','government','fuel','tools','other') then raise exception 'INVALID_EXPENSE'; end if;
 select settings into v_settings from public.system_settings where organization_id=p_org;
 v_tax_rate:=coalesce(nullif(v_settings->>'taxRate','')::numeric,5);
 v_single_limit:=coalesce(nullif(v_settings->>'singleExpenseLimit','')::numeric,5000);
 v_invoice_required:=coalesce(nullif(v_settings->>'requireInvoiceNumber','')::boolean,true);
 v_receipt_required:=coalesce(nullif(v_settings->>'requireReceiptForExpense','')::boolean,true);
 v_tax:=round(v_amount*v_tax_rate/100,2);
 v_expense_date:=coalesce(nullif(p_payload->>'expense_date','')::date,current_date);
 if v_invoice_required and coalesce(trim(p_payload->>'invoice_number'),'')='' then raise exception 'INVOICE_NUMBER_REQUIRED'; end if;
 if v_receipt_required and not coalesce((p_payload->>'has_receipt')::boolean,false) then raise exception 'RECEIPT_REQUIRED'; end if;
 v_task:=nullif(p_payload->>'task_id','');
 perform private.assert_expense_submit_access(p_org,p_payload->>'fund_id',v_task);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':expense:'||p_idempotency::text,0));
 select * into v_expense from public.expenses where organization_id=p_org and idempotency_key=p_idempotency;
 if found then return to_jsonb(v_expense); end if;
 select * into v_fund from public.funds where organization_id=p_org and id=p_payload->>'fund_id' for update;
 if not found or v_fund.status='closed' then raise exception 'FUND_NOT_FOUND_OR_CLOSED'; end if;
 if v_task is not null and not exists(select 1 from public.tasks where organization_id=p_org and id=v_task) then raise exception 'TASK_NOT_FOUND'; end if;
 v_account_id:=nullif(p_payload->>'standing_account_id','');
 if v_account_id is not null then
  select * into v_account from public.standing_accounts where organization_id=p_org and id=v_account_id and active for update;
  if not found or v_account.direction not in ('payable','payable_by_us') or coalesce(v_account.currency,'AED')<>v_fund.currency then raise exception 'INVALID_SUPPLIER_ACCOUNT'; end if;
 end if;
 if coalesce(trim(p_payload->>'invoice_number'),'')<>'' and exists(
  select 1 from public.expenses e where e.organization_id=p_org and e.status<>'rejected'
   and lower(trim(e.invoice_number))=lower(trim(p_payload->>'invoice_number'))
   and lower(trim(e.vendor_name))=lower(trim(p_payload->>'vendor_name'))
 ) then raise exception 'DUPLICATE_VENDOR_INVOICE'; end if;
 v_month_total:=0;
 if v_account_id is not null then
  select coalesce(sum(e.total_with_tax),0) into v_month_total from public.expenses e
   where e.organization_id=p_org and e.standing_account_id=v_account_id and e.status<>'rejected'
    and date_trunc('month',e.expense_date)=date_trunc('month',v_expense_date);
  v_month_total:=v_month_total+coalesce((select sum(x.amount) from public.standing_account_entries x
   where x.organization_id=p_org and x.standing_account_id=v_account_id and x.entry_type='charge'
    and x.expense_id is null and date_trunc('month',x.entry_date)=date_trunc('month',v_expense_date)),0);
 end if;
 v_special:=v_amount+v_tax>v_single_limit or (v_account_id is not null and v_account.monthly_limit is not null and v_account.monthly_limit>0 and v_month_total+v_amount+v_tax>v_account.monthly_limit);
 v_id:='exp-'||replace(gen_random_uuid()::text,'-','');
 v_code:='EXP-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 v_user:=coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'');
 insert into public.expenses(id,organization_id,code,fund_id,amount,tax_amount,total_with_tax,category,description,invoice_number,vendor_name,merchant_name,expense_date,receipt_url,has_receipt,status,submitted_by,task_id,notes,standing_account_id,standing_direction,idempotency_key,special_audit_required)
 values(v_id,p_org,v_code,v_fund.id,v_amount,v_tax,v_amount+v_tax,p_payload->>'category',trim(p_payload->>'description'),
  coalesce(p_payload->>'invoice_number',''),trim(p_payload->>'vendor_name'),nullif(p_payload->>'merchant_name',''),v_expense_date,
  nullif(p_payload->>'receipt_url',''),coalesce((p_payload->>'has_receipt')::boolean,false),'pending_approval',
  v_user,v_task,p_payload->>'notes',v_account_id,case when v_account_id is null then null else v_account.direction end,p_idempotency,v_special)
 returning * into v_expense;
 insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
 values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,
  (select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),
  v_user,coalesce((select role from public.organization_members where organization_id=p_org and auth_user_id=auth.uid() limit 1),'viewer'),
  'تسجيل مصروف','create','expense',v_id,'ضريبة محسوبة خادمياً بنسبة '||v_tax_rate||'%؛ المصروف بانتظار الاعتماد دون خصم العهدة.');
 return to_jsonb(v_expense);
end;
$finance$;

create or replace function public.finance_review_expense(p_org uuid,p_expense_id text,p_approve boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_exp public.expenses%rowtype; v_fund public.funds%rowtype; v_account public.standing_accounts%rowtype;
 v_name text; v_user text; v_key uuid; v_month_total numeric; v_month_limit numeric;
begin
 perform private.assert_finance_org_access(p_org);
 select * into v_exp from public.expenses where organization_id=p_org and id=p_expense_id for update;
 if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;
 if v_exp.status<>'pending_approval' then raise exception 'EXPENSE_NOT_PENDING'; end if;
 v_name:=coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'مستخدم النظام');
 v_user:=(select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1);
 if p_approve then
  if v_exp.special_audit_required and coalesce(trim(p_reason),'')='' then raise exception 'SPECIAL_AUDIT_NOTE_REQUIRED'; end if;
  if v_exp.standing_account_id is not null then
   select * into v_account from public.standing_accounts where organization_id=p_org and id=v_exp.standing_account_id and active for update;
   if not found or v_account.direction not in ('payable','payable_by_us') then raise exception 'SUPPLIER_ACCOUNT_NOT_AVAILABLE'; end if;
   if exists(select 1 from public.standing_account_entries e where e.organization_id=p_org and e.standing_account_id=v_account.id and lower(trim(coalesce(e.reference,'')))=lower(trim(v_exp.invoice_number)) and e.expense_id is distinct from v_exp.id) then raise exception 'DUPLICATE_SUPPLIER_INVOICE_REFERENCE'; end if;
   v_key:=md5(p_org::text||':expense-standing:'||v_exp.id)::uuid;
   insert into public.standing_account_entries(organization_id,standing_account_id,expense_id,entry_type,amount,balance_effect,currency,entry_date,description,reference,idempotency_key)
   values(p_org,v_account.id,v_exp.id,'charge',v_exp.total_with_tax,v_exp.total_with_tax,
    coalesce(v_account.currency,'AED'),coalesce(v_exp.expense_date,current_date),v_exp.description,
    coalesce(nullif(v_exp.invoice_number,''),v_exp.code),v_key)
   on conflict(organization_id,idempotency_key) do nothing;
  else
   select * into v_fund from public.funds where organization_id=p_org and id=v_exp.fund_id for update;
   if not found or v_fund.current_balance<v_exp.total_with_tax then raise exception 'INSUFFICIENT_FUND_BALANCE'; end if;
   update public.funds set current_balance=current_balance-v_exp.total_with_tax,spent_balance=spent_balance+v_exp.total_with_tax,
    status=case when current_balance-v_exp.total_with_tax<=0 then 'depleted'
     when total_allocation>0 and ((current_balance-v_exp.total_with_tax)/total_allocation)*100<=warning_threshold then 'warning' else 'active' end,
    updated_at=now() where organization_id=p_org and id=v_exp.fund_id;
   insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,reference_type,reference_id,description,idempotency_key)
   values(p_org,v_exp.fund_id,'expense_approval',v_exp.total_with_tax,-v_exp.total_with_tax,'expense',v_exp.id,
    'خصم مصروف معتمد: '||v_exp.code,md5(p_org::text||':expense-fund:'||v_exp.id)::uuid)
   on conflict(organization_id,idempotency_key) do nothing;
  end if;
  update public.expenses set status='approved',approved_by=v_name,approved_at=now(),approval_notes=nullif(trim(p_reason),''),updated_at=now()
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
