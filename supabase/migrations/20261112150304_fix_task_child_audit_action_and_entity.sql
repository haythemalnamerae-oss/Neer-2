-- Normalize child-table audit events to the constrained audit vocabulary.
-- Preserve the physical child table name in details while the audit entity remains the parent task.
create or replace function private.audit_task_child_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payload jsonb;
  v_org uuid;
  v_task_id text;
  v_record_id text;
  v_actor_id text;
  v_actor_name text;
  v_actor_role text;
  v_action_type text := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' when 'DELETE' then 'delete' else 'update' end;
  v_action_label text;
  v_summary text;
begin
  if tg_op='DELETE' then v_payload:=to_jsonb(old); else v_payload:=to_jsonb(new); end if;
  v_org:=(v_payload->>'organization_id')::uuid;
  v_task_id:=v_payload->>'task_id';
  v_record_id:=v_payload->>'id';

  if not exists(select 1 from public.tasks t where t.organization_id=v_org and t.id=v_task_id) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  select m.app_user_id,coalesce(u.name,''),coalesce(m.role,'viewer')
    into v_actor_id,v_actor_name,v_actor_role
  from public.organization_members m
  left join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id
  where m.organization_id=v_org and m.auth_user_id=auth.uid() and m.active
  limit 1;

  v_action_label:=case tg_table_name
    when 'task_checklist_items' then 'بند قائمة الفحص'
    when 'task_steps' then 'مرحلة تنفيذ'
    when 'task_subtasks' then 'مهمة فرعية'
    when 'task_daily_updates' then 'تقرير يومي'
    when 'task_comments' then 'تعليق على المهمة'
    when 'task_assignees' then 'مكلف بالمهمة'
    else 'سجل تابع للمهمة'
  end;
  v_summary:=case
    when tg_table_name in ('task_steps','task_subtasks') then coalesce(v_payload->>'title','')
    when tg_table_name='task_checklist_items' then coalesce(v_payload->>'text','')
    when tg_table_name='task_assignees' then coalesce(v_payload->>'app_user_name',v_payload->>'app_user_id','')
    when tg_table_name='task_daily_updates' then coalesce(v_payload->>'update_date','')
    when tg_table_name='task_comments' then case when coalesce((v_payload->>'is_internal')::boolean,false) then 'تعليق داخلي' else 'تعليق للفريق' end
    else ''
  end;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-child-'||pg_catalog.gen_random_uuid()::text,v_org,v_task_id,
    v_action_type||' '||v_action_label,coalesce(nullif(v_actor_name,''),'مستخدم النظام'),nullif(v_summary,''));

  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-child-'||pg_catalog.gen_random_uuid()::text,v_org,v_actor_id,
    coalesce(v_actor_name,'مستخدم النظام'),coalesce(v_actor_role,'viewer'),
    v_action_type||' '||v_action_label,v_action_type,'task',v_task_id,
    jsonb_build_object('task_id',v_task_id,'record_id',v_record_id,'child_table',tg_table_name,'operation',tg_op)::text);

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
