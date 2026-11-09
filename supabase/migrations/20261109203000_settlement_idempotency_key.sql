alter table public.settlements add column if not exists idempotency_key uuid;
create unique index if not exists settlements_org_idempotency_uidx
 on public.settlements(organization_id,idempotency_key) where idempotency_key is not null;

create or replace function public.finance_create_settlement(p_org uuid,p_fund_id text,p_period_start date,p_period_end date,p_expense_ids text[],p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_fund public.funds%rowtype; v_settlement public.settlements%rowtype; v_ids text[]; v_total numeric; v_count integer; v_id text; v_code text;
begin
 perform private.assert_finance_org_access(p_org);
 if p_idempotency is null or p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'INVALID_SETTLEMENT_PERIOD'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':settlement:'||p_idempotency::text,0));
 select * into v_settlement from public.settlements where organization_id=p_org and idempotency_key=p_idempotency;
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
 v_id:='stl-'||replace(gen_random_uuid()::text,'-','');
 v_code:='STL-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.settlements(id,organization_id,code,fund_id,holder_name,period_start,period_end,advance_amount,total_expenses,remaining_amount,status,expenses_count,settled_by,idempotency_key)
 values(v_id,p_org,v_code,p_fund_id,v_fund.holder_name,p_period_start,p_period_end,v_fund.total_allocation,v_total,v_fund.current_balance,'under_review',v_count,
  coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),''),p_idempotency)
 returning * into v_settlement;
 insert into public.settlement_expenses(organization_id,settlement_id,expense_id) select p_org,v_id,unnest(v_ids);
 insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
 values('aud-'||replace(gen_random_uuid()::text,'-',''),p_org,
  (select id from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),
  coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),''),
  'finance_officer','إنشاء تسوية','create','settlement',v_id,'حجز '||v_count||' فاتورة بإجمالي '||v_total);
 return to_jsonb(v_settlement);
end;
$finance$;
revoke all on function public.finance_create_settlement(uuid,text,date,date,text[],uuid) from public,anon;
grant execute on function public.finance_create_settlement(uuid,text,date,date,text[],uuid) to authenticated;
