-- Audited activation/deactivation for standing accounts; ledger entries and balances are untouched.
create or replace function public.set_standing_account_active(
  p_organization_id uuid,
  p_account_id text,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_app_user_id text;
  v_role text;
  v_actor_name text;
  v_account public.standing_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_organization_id is null or nullif(btrim(p_account_id),'') is null or p_active is null then
    raise exception using errcode = '22023', message = 'Organization, account and active state are required';
  end if;
  if length(coalesce(p_reason,'')) > 1000 then
    raise exception using errcode = '22023', message = 'Reason is too long';
  end if;

  select m.app_user_id,m.role,u.name
    into v_app_user_id,v_role,v_actor_name
  from public.organization_members m
  left join public.app_users u
    on u.organization_id=m.organization_id and u.id=m.app_user_id
  where m.organization_id=p_organization_id
    and m.auth_user_id=auth.uid() and m.active
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'Active membership in the selected organization required';
  end if;
  if v_role <> 'admin' and not exists (
    select 1 from public.role_permissions rp
    where rp.organization_id=p_organization_id
      and rp.role_key=v_role
      and rp.permission_key='funds.edit'
      and rp.granted
  ) then
    raise exception using errcode = '42501', message = 'Funds edit permission required';
  end if;

  select * into v_account
  from public.standing_accounts
  where organization_id=p_organization_id and id=p_account_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Standing account not found';
  end if;

  if v_account.active is distinct from p_active then
    update public.standing_accounts
    set active=p_active,updated_at=clock_timestamp()
    where organization_id=p_organization_id and id=p_account_id
    returning * into v_account;

    insert into public.audit_logs(
      id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details
    ) values(
      'aud-standing-status-'||gen_random_uuid()::text,p_organization_id,v_app_user_id,
      coalesce(v_actor_name,'مستخدم النظام'),v_role,
      case when p_active then 'إعادة تفعيل حساب دائم' else 'إيقاف حساب دائم' end,
      'update','standing_account',p_account_id,
      concat_ws(' | ',case when p_active then 'تمت إعادة التفعيل' else 'تم الإيقاف مع الاحتفاظ بالسجل المالي' end,nullif(btrim(p_reason),''))
    );
  end if;

  return to_jsonb(v_account);
end;
$$;

revoke all on function public.set_standing_account_active(uuid,text,boolean,text) from public, anon;
grant execute on function public.set_standing_account_active(uuid,text,boolean,text) to authenticated;
