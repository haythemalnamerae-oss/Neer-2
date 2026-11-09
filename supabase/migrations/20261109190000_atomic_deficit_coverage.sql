create or replace function public.finance_cover_deficit(p_org uuid,p_expense_id text,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path = '' as $finance$
declare v_exp public.expenses%rowtype; v_fund public.funds%rowtype; v_tx public.fund_transactions%rowtype; v_user text;
begin
 perform private.assert_finance_org_access(p_org);
 if p_idempotency is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':cover-deficit:'||p_idempotency::text,0));
 select * into v_tx from public.fund_transactions where organization_id=p_org and idempotency_key=p_idempotency;
 if found then select * into v_exp from public.expenses where organization_id=p_org and id=p_expense_id; return to_jsonb(v_exp); end if;
 select * into v_exp from public.expenses where organization_id=p_org and id=p_expense_id for update;
 if not found or v_exp.status<>'approved' or not v_exp.is_deficit or v_exp.is_covered_from_cash then raise exception 'DEFICIT_NOT_COVERABLE'; end if;
 select * into v_fund from public.funds where organization_id=p_org and id=v_exp.fund_id for update;
 if not found or v_fund.cash_box_balance<coalesce(v_exp.deficit_amount,0) or coalesce(v_exp.deficit_amount,0)<=0 then raise exception 'INSUFFICIENT_CASH_BOX_BALANCE'; end if;
 update public.funds set cash_box_balance=cash_box_balance-v_exp.deficit_amount,updated_at=now()
  where organization_id=p_org and id=v_exp.fund_id;
 v_user:=coalesce((select name from public.app_users where organization_id=p_org and auth_user_id=auth.uid() limit 1),'');
 update public.expenses set is_covered_from_cash=true,covered_at=now(),covered_by=v_user,updated_at=now()
  where organization_id=p_org and id=p_expense_id returning * into v_exp;
 insert into public.fund_transactions(organization_id,fund_id,transaction_type,amount,balance_delta,reference_type,reference_id,description,idempotency_key)
 values(p_org,v_exp.fund_id,'adjustment',v_exp.deficit_amount,-v_exp.deficit_amount,'expense',v_exp.id,'تغطية عجز المصروف من الصندوق: '||v_exp.code,p_idempotency)
 returning * into v_tx;
 return to_jsonb(v_exp);
end;
$finance$;
revoke all on function public.finance_cover_deficit(uuid,text,uuid) from public,anon;
grant execute on function public.finance_cover_deficit(uuid,text,uuid) to authenticated;
