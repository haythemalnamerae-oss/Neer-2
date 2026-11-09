-- Permit explicitly granted field officers to submit expenses, without granting approval or balance mutation.
create or replace function private.assert_expense_submit_access(p_org uuid,p_fund_id text,p_task_id text default null)
returns void language plpgsql security definer set search_path = '' as $guard$
declare v_role text; v_app_user text;
begin
 if auth.uid() is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select m.role,m.app_user_id into v_role,v_app_user
 from public.organization_members m
 where m.organization_id=p_org and m.auth_user_id=auth.uid() and m.active=true limit 1;
 if v_role is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if v_role not in ('admin','finance_officer') and not exists(
   select 1 from public.role_permissions rp
   where rp.organization_id=p_org and rp.role_key=v_role and rp.permission_key='expenses.create' and rp.granted=true
 ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if v_role='field_officer' and not exists(
   select 1 from public.funds f where f.organization_id=p_org and f.id=p_fund_id and f.holder_id=v_app_user and f.status<>'closed'
 ) then raise exception 'FUND_NOT_ASSIGNED_TO_FIELD_OFFICER'; end if;
 if p_task_id is not null and v_role='field_officer' and not exists(
   select 1 from public.tasks t where t.organization_id=p_org and t.id=p_task_id and t.assignee_id=v_app_user
 ) then raise exception 'TASK_NOT_ASSIGNED_TO_FIELD_OFFICER'; end if;
end;
$guard$;
revoke all on function private.assert_expense_submit_access(uuid,text,text) from public,anon;
grant execute on function private.assert_expense_submit_access(uuid,text,text) to authenticated;

create or replace function public.finance_create_expense(p_org uuid,p_payload jsonb,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_expense public.expenses%rowtype; v_account public.standing_accounts%rowtype;
 v_id text; v_code text; v_amount numeric; v_tax numeric; v_task text; v_account_id text; v_user text;
begin
 v_amount:=coalesce((p_payload->>'amount')::numeric,0);
 v_tax:=coalesce((p_payload->>'tax_amount')::numeric,0);
 if p_idempotency is null or v_amount<=0 or v_tax<0 or coalesce(trim(p_payload->>'description'),'')='' or
   coalesce(trim(p_payload->>'vendor_name'),'')='' or coalesce(trim(p_payload->>'category'),'') not in
   ('transport','materials','hospitality','maintenance','government','fuel','tools','other') then raise exception 'INVALID_EXPENSE'; end if;
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
 v_id:='exp-'||replace(gen_random_uuid()::text,'-','');
 v_code:='EXP-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 v_user:=coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'');
 insert into public.expenses(id,organization_id,code,fund_id,amount,tax_amount,total_with_tax,category,description,invoice_number,vendor_name,merchant_name,expense_date,receipt_url,has_receipt,status,submitted_by,task_id,notes,standing_account_id,standing_direction,idempotency_key)
 values(v_id,p_org,v_code,v_fund.id,v_amount,v_tax,v_amount+v_tax,p_payload->>'category',trim(p_payload->>'description'),
  coalesce(p_payload->>'invoice_number',''),trim(p_payload->>'vendor_name'),nullif(p_payload->>'merchant_name',''),
  coalesce(nullif(p_payload->>'expense_date','')::date,current_date),nullif(p_payload->>'receipt_url',''),
  coalesce((p_payload->>'has_receipt')::boolean,false),'pending_approval',v_user,v_task,p_payload->>'notes',
  v_account_id,case when v_account_id is null then null else v_account.direction end,p_idempotency)
 returning * into v_expense;
 insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
 values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,
  (select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),
  v_user,coalesce((select role from public.organization_members where organization_id=p_org and auth_user_id=auth.uid() limit 1),'viewer'),
  'تسجيل مصروف','create','expense',v_id,'تم تسجيل المصروف بانتظار الاعتماد دون خصم العهدة.');
 return to_jsonb(v_expense);
end;
$finance$;
