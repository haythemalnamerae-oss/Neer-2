-- Idempotency columns for create operations and disable obsolete settlement close RPC.
alter table public.funds add column if not exists idempotency_key uuid;
alter table public.standing_accounts add column if not exists idempotency_key uuid;
alter table public.cash_receipts add column if not exists idempotency_key uuid;
create unique index if not exists funds_org_idempotency_uidx on public.funds(organization_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists standing_accounts_org_idempotency_uidx on public.standing_accounts(organization_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists cash_receipts_org_idempotency_uidx on public.cash_receipts(organization_id,idempotency_key) where idempotency_key is not null;

create or replace function public.finance_create_fund(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_id text; v_code text; v_user text;
begin
 perform private.assert_finance_org_access(p_org);
 if p_idempotency is null or coalesce(trim(p_payload->>'name'),'')='' or coalesce((p_payload->>'total_allocation')::numeric,0)<=0 then raise exception 'INVALID_FUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':fund:'||p_idempotency::text,0));
 select * into v_fund from public.funds where organization_id=p_org and idempotency_key=p_idempotency;
 if found then return to_jsonb(v_fund); end if;
 if coalesce(p_payload->>'holder_id','')='' or not exists(select 1 from public.app_users where organization_id=p_org and id=p_payload->>'holder_id' and active) then raise exception 'FUND_HOLDER_NOT_FOUND'; end if;
 v_id := 'fund-'||replace(gen_random_uuid()::text,'-','');
 v_code := 'PCF-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 v_user := coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'');
 insert into public.funds(id,organization_id,name,code,holder_id,holder_name,holder_department,total_allocation,current_balance,spent_balance,currency,status,warning_threshold,last_replenished_date,purpose,notes,cash_box_balance,idempotency_key)
 values(v_id,p_org,trim(p_payload->>'name'),v_code,p_payload->>'holder_id',
  (select name from public.app_users where organization_id=p_org and id=p_payload->>'holder_id'),
  coalesce((select department from public.app_users where organization_id=p_org and id=p_payload->>'holder_id'),''),
  (p_payload->>'total_allocation')::numeric,(p_payload->>'total_allocation')::numeric,0,
  coalesce(nullif(p_payload->>'currency',''),'AED'),'active',coalesce((p_payload->>'warning_threshold')::numeric,30),current_date,
  coalesce(p_payload->>'purpose',''),p_payload->>'notes',0,p_idempotency) returning * into v_fund;
 insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,description,idempotency_key)
 values(p_org,v_id,'adjustment',v_fund.total_allocation,v_fund.total_allocation,'تخصيص أولي للعهدة',md5(p_org::text||':fund-opening:'||v_id)::uuid);
 insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
 values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,(select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),
  v_user,'admin','إنشاء عهدة','create','fund',v_id,'تخصيص عهدة جديدة بقيمة '||v_fund.total_allocation);
 return to_jsonb(v_fund);
end;
$finance$;

create or replace function public.finance_create_standing_account(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_account public.standing_accounts%rowtype; v_id text; v_direction text; v_code text;
begin
 perform private.assert_finance_org_access(p_org);
 if p_idempotency is null or coalesce(trim(p_payload->>'name'),'')='' then raise exception 'INVALID_STANDING_ACCOUNT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':standing-account:'||p_idempotency::text,0));
 select * into v_account from public.standing_accounts where organization_id=p_org and idempotency_key=p_idempotency;
 if found then return to_jsonb(v_account); end if;
 v_direction:=coalesce(p_payload->>'direction','payable');
 if v_direction not in ('payable','payable_by_us','receivable','receivable_for_us') then raise exception 'INVALID_ACCOUNT_DIRECTION'; end if;
 if coalesce((p_payload->>'opening_balance')::numeric,0)<0 then raise exception 'INVALID_OPENING_BALANCE'; end if;
 v_id:='std-'||replace(gen_random_uuid()::text,'-','');
 v_code:='STD-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.standing_accounts(organization_id,id,code,name,category,direction,monthly_limit,default_amount,notes,active,vendor_name,contact_phone,address,image_url,reference_image_url,account_type,currency,opening_balance,idempotency_key)
 values(p_org,v_id,v_code,trim(p_payload->>'name'),coalesce(p_payload->>'category','other'),v_direction,
  nullif(p_payload->>'monthly_limit','')::numeric,nullif(p_payload->>'default_amount','')::numeric,p_payload->>'notes',true,
  nullif(p_payload->>'vendor_name',''),nullif(p_payload->>'contact_phone',''),nullif(p_payload->>'address',''),
  nullif(p_payload->>'image_url',''),nullif(p_payload->>'reference_image_url',''),p_payload->>'account_type',
  coalesce(nullif(p_payload->>'currency',''),'AED'),coalesce((p_payload->>'opening_balance')::numeric,0),p_idempotency)
 returning * into v_account;
 return to_jsonb(v_account);
end;
$finance$;

create or replace function public.finance_create_cash_receipt(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_receipt public.cash_receipts%rowtype; v_fund public.funds%rowtype; v_id text; v_user text; v_code text;
begin
 perform private.assert_finance_org_access(p_org);
 if p_idempotency is null or coalesce((p_payload->>'amount')::numeric,0)<=0 or coalesce(trim(p_payload->>'source'),'')='' then raise exception 'INVALID_CASH_RECEIPT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':cash-receipt:'||p_idempotency::text,0));
 select * into v_receipt from public.cash_receipts where organization_id=p_org and idempotency_key=p_idempotency;
 if found then return to_jsonb(v_receipt); end if;
 if coalesce(p_payload->>'type','other')='cash_box' then
  select * into v_fund from public.funds where organization_id=p_org and id=p_payload->>'fund_id' for update;
  if not found then raise exception 'FUND_NOT_FOUND'; end if;
  update public.funds set cash_box_balance=cash_box_balance+(p_payload->>'amount')::numeric,updated_at=now()
   where organization_id=p_org and id=v_fund.id;
 end if;
 v_id:='cr-'||replace(gen_random_uuid()::text,'-','');
 v_code:='REC-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 v_user:=coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'');
 insert into public.cash_receipts(id,organization_id,code,amount,source,type,received_by,receipt_date,notes,fund_id,idempotency_key)
 values(v_id,p_org,v_code,(p_payload->>'amount')::numeric,trim(p_payload->>'source'),coalesce(p_payload->>'type','other'),
  v_user,coalesce(nullif(p_payload->>'receipt_date','')::date,current_date),p_payload->>'notes',
  case when p_payload->>'type'='cash_box' then p_payload->>'fund_id' else null end,p_idempotency) returning * into v_receipt;
 return to_jsonb(v_receipt);
end;
$finance$;

create or replace function public.finance_create_standing_entry(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_account public.standing_accounts%rowtype; v_entry public.standing_account_entries%rowtype; v_effect numeric;
begin
 perform private.assert_finance_org_access(p_org);
 if p_idempotency is null or coalesce((p_payload->>'amount')::numeric,0)<=0 then raise exception 'INVALID_STANDING_ENTRY'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':standing-entry:'||p_idempotency::text,0));
 select * into v_entry from public.standing_account_entries where organization_id=p_org and idempotency_key=p_idempotency;
 if found then return to_jsonb(v_entry); end if;
 select * into v_account from public.standing_accounts where organization_id=p_org and id=p_payload->>'standing_account_id' and active for update;
 if not found then raise exception 'STANDING_ACCOUNT_NOT_FOUND'; end if;
 if p_payload->>'entry_type' not in ('charge','payment','advance','collection') then raise exception 'INVALID_ENTRY_TYPE'; end if;
 v_effect:=case when p_payload->>'entry_type'='charge' then (p_payload->>'amount')::numeric else -(p_payload->>'amount')::numeric end;
 insert into public.standing_account_entries(organization_id,standing_account_id,task_id,fund_id,expense_id,entry_type,amount,balance_effect,currency,entry_date,description,reference,invoice_image_url,ocr_data,idempotency_key)
 values(p_org,v_account.id,nullif(p_payload->>'task_id',''),nullif(p_payload->>'fund_id',''),nullif(p_payload->>'expense_id',''),p_payload->>'entry_type',
  (p_payload->>'amount')::numeric,v_effect,coalesce(nullif(p_payload->>'currency',''),v_account.currency,'AED'),
  coalesce(nullif(p_payload->>'entry_date','')::date,current_date),coalesce(p_payload->>'description',''),p_payload->>'reference',
  p_payload->>'invoice_image_url',p_payload->'ocr_data',p_idempotency) returning * into v_entry;
 return to_jsonb(v_entry);
end;
$finance$;

revoke execute on function public.finance_close_settlement(uuid,text,boolean,text) from public,anon,authenticated;
revoke all on function public.finance_create_fund(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_create_standing_account(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_create_cash_receipt(uuid,jsonb,uuid) from public,anon;
revoke all on function public.finance_create_standing_entry(uuid,jsonb,uuid) from public,anon;
grant execute on function public.finance_create_fund(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_create_standing_account(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_create_cash_receipt(uuid,jsonb,uuid) to authenticated;
grant execute on function public.finance_create_standing_entry(uuid,jsonb,uuid) to authenticated;
