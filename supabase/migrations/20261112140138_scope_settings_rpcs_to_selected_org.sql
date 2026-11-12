-- Bind settings RPCs to the organization already authenticated by the API gateway.
-- The organization id is never trusted alone: each function rechecks active membership for auth.uid().
drop function if exists public.save_organization_settings(jsonb);
drop function if exists public.get_organization_settings();

create or replace function public.save_organization_settings(p_organization_id uuid, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_app_user_id text;
  v_role text;
  v_name text;
  v_settings jsonb;
  v_key text;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_organization_id is null or p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'Organization and settings object are required';
  end if;

  select m.app_user_id,m.role,u.name into v_app_user_id,v_role,v_name
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
      and rp.permission_key='settings.edit'
      and rp.granted
  ) then
    raise exception using errcode = '42501', message = 'Settings edit permission required';
  end if;

  for v_key in select jsonb_object_keys(p_settings)
  loop
    if v_key not in (
      'appName','organizationName','taxRegistrationNumber','headquarters','supportEmail','supportPhone',
      'currency','taxRate','singleExpenseLimit','fundWarningThresholdPercent','autoNotifyOnLowBalance',
      'requireReceiptForExpense','requireInvoiceNumber','requireDualApprovalForSettlements','fiscalYearStartMonth',
      'autoCaptureLocationWithoutApproval','defaultTaskDurationDays','requireFundForTaskExpenses',
      'budgetOverrunTolerancePercent','autoFollowUpReminderHours','allowOfflineTaskSync',
      'notifyOnUrgentTask','notifyOnExpenseRejected','notifyOnFundReplenished','notifyOnSettlementDue',
      'enableSoundAlerts','dateFormat','timeFormat','numberFormatting','themeAccent'
    ) then
      raise exception using errcode = '22023', message = 'Unsupported settings key';
    end if;
  end loop;

  if p_settings ? 'currency' and (jsonb_typeof(p_settings->'currency') <> 'string' or (p_settings->>'currency') !~ '^[A-Z]{3}$') then
    raise exception using errcode = '22023', message = 'Currency must be a three-letter uppercase code';
  end if;
  if p_settings ? 'taxRate' and ((p_settings->>'taxRate')::numeric < 0 or (p_settings->>'taxRate')::numeric > 100) then
    raise exception using errcode = '22023', message = 'Tax rate must be between 0 and 100';
  end if;
  if p_settings ? 'fundWarningThresholdPercent' and ((p_settings->>'fundWarningThresholdPercent')::numeric < 0 or (p_settings->>'fundWarningThresholdPercent')::numeric > 100) then
    raise exception using errcode = '22023', message = 'Fund warning threshold must be between 0 and 100';
  end if;
  if p_settings ? 'singleExpenseLimit' and (p_settings->>'singleExpenseLimit')::numeric < 0 then
    raise exception using errcode = '22023', message = 'Single expense limit cannot be negative';
  end if;
  if p_settings ? 'autoCaptureLocationWithoutApproval' and v_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Only administrators may change automatic location capture';
  end if;

  insert into public.system_settings(organization_id,settings,updated_by,updated_at)
  values(p_organization_id,p_settings,v_app_user_id,clock_timestamp())
  on conflict (organization_id) do update
    set settings=public.system_settings.settings || excluded.settings,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at
  returning settings into v_settings;

  insert into public.audit_logs(
    id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details
  ) values(
    'aud-settings-'||gen_random_uuid()::text,p_organization_id,v_app_user_id,
    coalesce(v_name,'مستخدم النظام'),v_role,'تحديث إعدادات المنشأة',
    'update','system_settings',p_organization_id::text,'تم حفظ إعدادات المؤسسة عبر مسار الخادم الموثق'
  );

  return v_settings;
end;
$$;

create or replace function public.get_organization_settings(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role text;
  v_settings jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_organization_id is null then
    raise exception using errcode = '22023', message = 'Organization id is required';
  end if;

  select m.role into v_role
  from public.organization_members m
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
      and rp.permission_key='settings.view'
      and rp.granted
  ) then
    raise exception using errcode = '42501', message = 'Settings view permission required';
  end if;

  select s.settings into v_settings
  from public.system_settings s
  where s.organization_id=p_organization_id;

  return coalesce(v_settings,'{}'::jsonb);
end;
$$;

revoke all on function public.save_organization_settings(uuid,jsonb) from public, anon;
revoke all on function public.get_organization_settings(uuid) from public, anon;
grant execute on function public.save_organization_settings(uuid,jsonb) to authenticated;
grant execute on function public.get_organization_settings(uuid) to authenticated;
