-- Enforce maker-checker separation for task outcome approval.
-- Additive function replacement only; no task rows or financial records are modified.
create or replace function public.review_task_approval(
  p_organization_id uuid,
  p_task_id text,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_task public.tasks%rowtype;
  v_app_user_id text;
  v_actor_name text;
  v_actor_role text;
  v_now timestamptz := clock_timestamp();
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_action not in ('approve','reject') then
    raise exception using errcode = '22023', message = 'Unsupported task review action';
  end if;
  if p_action = 'reject' and coalesce(nullif(btrim(p_notes),''),'') = '' then
    raise exception using errcode = '22023', message = 'A rejection reason is required';
  end if;
  if not private.can_access_task(p_organization_id,p_task_id,'approve') then
    raise exception using errcode = '42501', message = 'Task approval permission required';
  end if;

  select m.app_user_id,m.role,u.name into v_app_user_id,v_actor_role,v_actor_name
  from public.organization_members m
  left join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active
  limit 1;

  select * into v_task from public.tasks
  where organization_id=p_organization_id and id=p_task_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  v_new_status := case when p_action='approve' then 'completed' else 'rejected' end;
  if v_task.creator_id = v_app_user_id then
    raise exception using errcode = '42501', message = 'Task creators cannot approve or reject their own task outcomes';
  end if;

  if v_task.status <> 'pending_approval' then
    if v_task.status = v_new_status then
      return jsonb_build_object('task_id',p_task_id,'status',v_task.status,'already_reviewed',true);
    end if;
    raise exception using errcode = '22023', message = 'Task is not awaiting approval';
  end if;

  perform set_config('neer.task_transition','review',true);
  update public.tasks set
    status=v_new_status,
    approval_notes=case when p_action='approve' then nullif(btrim(p_notes),'') else approval_notes end,
    rejection_reason=case when p_action='reject' then nullif(btrim(p_notes),'') else null end,
    actual_end_time=case when p_action='approve' then coalesce(actual_end_time,v_now) else actual_end_time end,
    updated_at=v_now
  where organization_id=p_organization_id and id=p_task_id;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-review-'||gen_random_uuid()::text,p_organization_id,p_task_id,
    case when p_action='approve' then 'اعتماد إنجاز المهمة' else 'رفض اعتماد المهمة وإعادتها للمراجعة' end,
    coalesce(v_actor_name,'مستخدم النظام'),nullif(btrim(p_notes),''));

  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-review-'||gen_random_uuid()::text,p_organization_id,v_app_user_id,
    coalesce(v_actor_name,'مستخدم النظام'),coalesce(v_actor_role,'viewer'),
    case when p_action='approve' then 'اعتماد مهمة' else 'رفض اعتماد مهمة' end,
    'update','task',p_task_id,coalesce(p_notes,''));

  insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
  values('notif-review-'||gen_random_uuid()::text,p_organization_id,v_task.creator_id,
    case when p_action='approve' then 'تم اعتماد المهمة' else 'أعيدت المهمة للمراجعة' end,
    'تمت مراجعة المهمة "'||v_task.title||'". '||coalesce(p_notes,''),
    case when p_action='approve' then 'success' else 'alert' end,false,'tasks');

  return jsonb_build_object('task_id',p_task_id,'status',v_new_status,'already_reviewed',false);
end;
$$;

revoke all on function public.review_task_approval(uuid,text,text,text) from public, anon;
grant execute on function public.review_task_approval(uuid,text,text,text) to authenticated;

