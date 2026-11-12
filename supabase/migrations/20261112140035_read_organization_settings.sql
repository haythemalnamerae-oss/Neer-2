-- Read settings through the same tenant-derived authorization boundary as settings writes.
create or replace function public.get_organization_settings()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_org_id uuid;
  v_role text;
  v_settings jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select m.organization_id,m.role into v_org_id,v_role
  from public.organization_members m
  where m.auth_user_id=auth.uid() and m.active
  order by m.is_default desc
  limit 1;

  if v_org_id is null then
    raise exception using errcode = '42501', message = 'Active organization membership required';
  end if;
  if v_role <> 'admin' and not exists (
    select 1 from public.role_permissions rp
    where rp.organization_id=v_org_id
      and rp.role_key=v_role
      and rp.permission_key='settings.view'
      and rp.granted
  ) then
    raise exception using errcode = '42501', message = 'Settings view permission required';
  end if;

  select s.settings into v_settings
  from public.system_settings s
  where s.organization_id=v_org_id;

  return coalesce(v_settings,'{}'::jsonb);
end;
$$;

revoke all on function public.get_organization_settings() from public, anon;
grant execute on function public.get_organization_settings() to authenticated;
