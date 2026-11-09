-- Correct replenishment semantics, task expense totals, and account reference uniqueness.
create unique index if not exists standing_entries_account_reference_uidx
 on public.standing_account_entries(organization_id,standing_account_id,lower(btrim(reference)))
 where reference is not null and btrim(reference)<>'';

create or replace function private.apply_approved_expense_to_task()
returns trigger language plpgsql set search_path = '' as $trigger$
begin
 if old.status='pending_approval' and new.status='approved' and new.task_id is not null then
  update public.tasks set spent_amount=spent_amount+new.total_with_tax,updated_at=now()
   where organization_id=new.organization_id and id=new.task_id;
 end if;
 return new;
end;
$trigger$;
drop trigger if exists expenses_update_task_spent_amount on public.expenses;
create trigger expenses_update_task_spent_amount
after update of status on public.expenses
for each row when (old.status='pending_approval' and new.status='approved')
execute function private.apply_approved_expense_to_task();

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
 update public.funds set current_balance=current_balance+p_amount,
  status=case when current_balance+p_amount<=0 then 'depleted'
   when total_allocation>0 and ((current_balance+p_amount)/total_allocation)*100<=warning_threshold then 'warning' else 'active' end,
  last_replenished_date=current_date,updated_at=now()
  where organization_id=p_org and id=p_fund_id returning * into v_fund;
 insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,description,idempotency_key)
 values(p_org,p_fund_id,'replenishment',p_amount,p_amount,coalesce(p_notes,'تغذية عهدة'),p_idempotency) returning * into v_tx;
 return jsonb_build_object('fund',to_jsonb(v_fund),'transaction',to_jsonb(v_tx));
end;
$finance$;

create or replace function public.finance_settle_standing_account(p_org uuid,p_account_id text,p_amount numeric,p_fund_id text,p_entry_date date,p_reference text,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_account public.standing_accounts%rowtype; v_fund public.funds%rowtype; v_entry public.standing_account_entries%rowtype;
 v_balance numeric; v_payable boolean; v_type text; v_receipt_id text;
begin
 perform private.assert_finance_org_access(p_org);
 if p_amount<=0 or p_idempotency is null or coalesce(trim(p_reference),'')='' then raise exception 'INVALID_ACCOUNT_SETTLEMENT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':standing-settlement:'||p_idempotency::text,0));
 select * into v_entry from public.standing_account_entries where organization_id=p_org and idempotency_key=p_idempotency;
 if found then return to_jsonb(v_entry); end if;
 select * into v_account from public.standing_accounts where organization_id=p_org and id=p_account_id for update;
 if not found then raise exception 'STANDING_ACCOUNT_NOT_FOUND'; end if;
 if exists(select 1 from public.standing_account_entries e where e.organization_id=p_org and e.standing_account_id=p_account_id and lower(btrim(e.reference))=lower(btrim(p_reference))) then raise exception 'DUPLICATE_ACCOUNT_REFERENCE'; end if;
 select coalesce(v_account.opening_balance,0)+coalesce(sum(e.balance_effect),0) into v_balance
 from public.standing_account_entries e where e.organization_id=p_org and e.standing_account_id=p_account_id;
 if p_amount>v_balance then raise exception 'SETTLEMENT_EXCEEDS_ACCOUNT_BALANCE'; end if;
 v_payable:=v_account.direction in ('payable','payable_by_us');
 select * into v_fund from public.funds where organization_id=p_org and id=p_fund_id for update;
 if not found or v_fund.currency<>coalesce(v_account.currency,'AED') then raise exception 'INVALID_SETTLEMENT_FUND_OR_CURRENCY'; end if;
 if v_payable then
  if v_fund.current_balance<p_amount then raise exception 'INSUFFICIENT_FUND_BALANCE'; end if;
  v_type:='payment';
  update public.funds set current_balance=current_balance-p_amount,spent_balance=spent_balance+p_amount,
   status=case when current_balance-p_amount<=0 then 'depleted' when total_allocation>0 and ((current_balance-p_amount)/total_allocation)*100<=warning_threshold then 'warning' else 'active' end,
   updated_at=now() where organization_id=p_org and id=p_fund_id;
  insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,reference_type,reference_id,description,idempotency_key)
  values(p_org,p_fund_id,'settlement_close',p_amount,-p_amount,'standing_account',p_account_id,'سداد حساب: '||v_account.name,md5(p_org::text||':standing-payment:'||p_idempotency::text)::uuid);
 else
  v_type:='collection';
  update public.funds set cash_box_balance=cash_box_balance+p_amount,updated_at=now() where organization_id=p_org and id=p_fund_id;
  v_receipt_id:='cr-'||replace(gen_random_uuid()::text,'-','');
  insert into public.cash_receipts(id,organization_id,code,amount,source,type,received_by,receipt_date,notes,fund_id)
  values(v_receipt_id,p_org,'REC-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
   p_amount,'تحصيل من حساب '||v_account.name,'cash_box',
   coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'',
   coalesce(p_entry_date,current_date),p_reference,p_fund_id);
 end if;
 insert into public.standing_account_entries(organization_id,standing_account_id,fund_id,entry_type,amount,balance_effect,currency,entry_date,description,reference,idempotency_key)
 values(p_org,p_account_id,p_fund_id,v_type,p_amount,-p_amount,coalesce(v_account.currency,'AED'),coalesce(p_entry_date,current_date),
  case when v_payable then 'سداد للمورد' else 'تحصيل من الطرف المدين' end,p_reference,p_idempotency) returning * into v_entry;
 return to_jsonb(v_entry);
end;
$finance$;

create or replace function public.finance_review_settlement(p_org uuid,p_settlement_id text,p_action text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_settlement public.settlements%rowtype; v_name text; v_uid uuid; v_require_dual boolean;
begin
 perform private.assert_finance_org_access(p_org);
 if p_action not in ('audit','approve','reject') then raise exception 'INVALID_SETTLEMENT_ACTION'; end if;
 select coalesce((s.settings->>'requireDualApprovalForSettlements')::boolean,true) into v_require_dual
 from public.system_settings s where s.organization_id=p_org;
 v_require_dual:=coalesce(v_require_dual,true);
 select * into v_settlement from public.settlements where organization_id=p_org and id=p_settlement_id for update;
 if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
 v_uid:=auth.uid();
 v_name:=coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=v_uid limit 1),'مستخدم النظام');
 if p_action='audit' then
  if v_settlement.status<>'under_review' then raise exception 'SETTLEMENT_NOT_AUDITABLE'; end if;
  update public.settlements set status='audited',audited_by=v_name,audited_by_auth_user_id=v_uid,audited_at=now(),
   audit_notes=coalesce(p_notes,audit_notes),updated_at=now()
   where organization_id=p_org and id=p_settlement_id returning * into v_settlement;
 elsif p_action='approve' then
  if v_settlement.status='under_review' and not v_require_dual then
   null;
  elsif v_settlement.status<>'audited' or v_settlement.audited_by_auth_user_id=v_uid then
   raise exception 'SECOND_APPROVER_REQUIRED';
  end if;
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
  (select id from public.app_users where organization_id=p_org and auth_user_id=v_uid limit 1),v_name,
  coalesce((select role from public.organization_members where organization_id=p_org and auth_user_id=v_uid limit 1),'finance_officer'),
  case p_action when 'audit' then 'تدقيق تسوية' when 'approve' then 'اعتماد تسوية' else 'رفض تسوية' end,
  p_action,'settlement',p_settlement_id,coalesce(p_notes,''));
 return to_jsonb(v_settlement);
end;
$finance$;
revoke all on function public.finance_replenish_fund(uuid,text,numeric,text,uuid) from public,anon;
revoke all on function public.finance_settle_standing_account(uuid,text,numeric,text,date,text,uuid) from public,anon;
revoke all on function public.finance_review_settlement(uuid,text,text,text) from public,anon;
grant execute on function public.finance_replenish_fund(uuid,text,numeric,text,uuid) to authenticated;
grant execute on function public.finance_settle_standing_account(uuid,text,numeric,text,date,text,uuid) to authenticated;
grant execute on function public.finance_review_settlement(uuid,text,text,text) to authenticated;
