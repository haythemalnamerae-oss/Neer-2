-- Restrict audit-log writes to trusted database-owned paths and make standing charges auditable.
begin;

create or replace function public.finance_create_standing_entry(
  p_org uuid,
  p_payload jsonb,
  p_idempotency uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $finance$
declare
  v_account public.standing_accounts%rowtype;
  v_entry public.standing_account_entries%rowtype;
  v_effect numeric;
  v_user_id text;
  v_user_name text;
  v_user_role text;
begin
  perform private.assert_finance_org_access(p_org);

  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or p_idempotency is null
     or coalesce((p_payload->>'amount')::numeric, 0) <= 0 then
    raise exception 'INVALID_STANDING_ENTRY';
  end if;

  -- This endpoint is deliberately limited to non-cash charges.
  -- Payments, advances and collections must use atomic settlement/receipt workflows.
  if p_payload->>'entry_type' is distinct from 'charge' then
    raise exception 'INVALID_ENTRY_TYPE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_org::text || ':standing-entry:' || p_idempotency::text, 0)
  );

  select * into v_entry
  from public.standing_account_entries
  where organization_id = p_org and idempotency_key = p_idempotency;

  if found then
    return to_jsonb(v_entry);
  end if;

  select * into v_account
  from public.standing_accounts
  where organization_id = p_org
    and id = p_payload->>'standing_account_id'
    and active
  for update;

  if not found then
    raise exception 'STANDING_ACCOUNT_NOT_FOUND';
  end if;

  v_effect := (p_payload->>'amount')::numeric;

  insert into public.standing_account_entries(
    organization_id, standing_account_id, task_id, fund_id, expense_id,
    entry_type, amount, balance_effect, currency, entry_date, description,
    reference, invoice_image_url, ocr_data, idempotency_key
  )
  values(
    p_org, v_account.id, nullif(p_payload->>'task_id',''),
    nullif(p_payload->>'fund_id',''), nullif(p_payload->>'expense_id',''),
    'charge', v_effect, v_effect,
    coalesce(nullif(p_payload->>'currency',''), v_account.currency, 'AED'),
    coalesce(nullif(p_payload->>'entry_date','')::date, current_date),
    coalesce(p_payload->>'description',''), p_payload->>'reference',
    p_payload->>'invoice_image_url', p_payload->'ocr_data', p_idempotency
  )
  returning * into v_entry;

  select au.id, au.name, om.role
    into v_user_id, v_user_name, v_user_role
  from public.app_users au
  join public.organization_members om
    on om.organization_id = au.organization_id
   and om.app_user_id = au.id
   and om.auth_user_id = auth.uid()
   and om.active = true
  where au.organization_id = p_org
    and au.auth_user_id = auth.uid()
  limit 1;

  insert into public.audit_logs(
    id, organization_id, user_id, user_name, user_role,
    action, action_type, entity, entity_id, details
  )
  values(
    'aud-' || replace(gen_random_uuid()::text, '-', ''),
    p_org, v_user_id, coalesce(v_user_name, 'مستخدم النظام'),
    coalesce(v_user_role, 'unknown'),
    'تسجيل قيد على حساب ثابت', 'create', 'standing_account_entry',
    v_entry.id::text,
    'إضافة قيد charge بقيمة ' || v_entry.amount::text ||
      ' للحساب ' || v_account.name
  );

  return to_jsonb(v_entry);
end;
$finance$;

-- Audit rows are written by SECURITY DEFINER workflows and database triggers.
-- Ordinary clients must not forge or alter the central audit trail directly.
revoke insert on public.audit_logs from public, anon, authenticated;
drop policy if exists audit_insert on public.audit_logs;

commit;
