-- Materialize each approved subtask as a first-class task card while retaining its parent relation.
-- Restrict direct child-table writes to the audited SECURITY DEFINER workflows.
alter table public.tasks drop constraint if exists tasks_organization_id_parent_task_id_fkey;
alter table public.tasks add constraint tasks_organization_id_parent_task_id_fkey
  foreign key (organization_id,parent_task_id)
  references public.tasks(organization_id,id)
  on delete set null (parent_task_id) not valid;
alter table public.tasks validate constraint tasks_organization_id_parent_task_id_fkey;

revoke insert,update,delete on public.task_steps,public.task_subtasks from anon,authenticated;
grant select on public.task_steps,public.task_subtasks to authenticated;

create or replace function public.set_task_subtask_state(
  p_organization_id uuid,p_task_id text,p_subtask_id text,p_action text,p_status text default null,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_sub public.task_subtasks%rowtype;
  v_app_user_id text;
  v_role text;
  v_name text;
  v_parent public.tasks%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_action not in ('update','approve','reject') then raise exception using errcode='22023',message='Unsupported subtask action'; end if;
  select m.app_user_id,m.role,u.name into v_app_user_id,v_role,v_name
  from public.organization_members m
  join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id and u.active
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active limit 1;
  if not found or v_app_user_id is null then raise exception using errcode='42501',message='Active operational membership required'; end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then raise exception using errcode='42501',message='Task edit permission required'; end if;
  select * into v_sub from public.task_subtasks
  where organization_id=p_organization_id and task_id=p_task_id and id=p_subtask_id for update;
  if not found then raise exception using errcode='P0002',message='Subtask not found'; end if;
  select * into v_parent from public.tasks where organization_id=p_organization_id and id=p_task_id;

  if p_action='update' then
    if v_role='field_officer' and v_sub.assignee_id is distinct from v_app_user_id then
      raise exception using errcode='42501',message='Only the assigned field officer can update this subtask'; end if;
    if p_status not in ('scheduled','in_progress','completed','blocked','deferred') then
      raise exception using errcode='22023',message='Invalid subtask status'; end if;
    if v_sub.approval_status='pending' or v_sub.approval_status='rejected' then
      raise exception using errcode='42501',message='Subtask must be approved before execution'; end if;
    update public.task_subtasks set status=p_status,
      started_at=case when p_status='in_progress' then coalesce(started_at,clock_timestamp()) else started_at end,
      completed_at=case when p_status='completed' then clock_timestamp() else null end,
      notes=coalesce(p_notes,notes),updated_at=clock_timestamp()
    where organization_id=p_organization_id and id=p_subtask_id returning * into v_sub;

    -- The child task is a first-class card; completion enters the normal task approval queue.
    update public.tasks set
      status=case when p_status='completed' then 'pending_approval' when p_status='blocked' then 'paused' else p_status end,
      execution_status=case when p_status='completed' then 'completed' when p_status='blocked' then 'paused' else p_status end,
      actual_end_time=case when p_status='completed' then clock_timestamp() else null end,
      updated_at=clock_timestamp()
    where organization_id=p_organization_id and id=p_subtask_id and parent_task_id=p_task_id;
  else
    if v_role<>'admin' and not exists(
      select 1 from public.role_permissions rp
      where rp.organization_id=p_organization_id and rp.role_key=v_role
        and rp.permission_key='tasks.approve' and rp.granted
    ) then raise exception using errcode='42501',message='Task approval permission required'; end if;
    if v_sub.created_by=v_app_user_id then raise exception using errcode='42501',message='Subtask creator cannot review own subtask'; end if;
    if v_sub.approval_status<>'pending' then raise exception using errcode='22023',message='Subtask is not awaiting approval'; end if;

    if p_action='approve' then
      update public.task_subtasks set approval_status='approved',is_approved=true,approved_by_manager=true,
        approved_by=v_app_user_id,approved_at=clock_timestamp(),status='scheduled',updated_at=clock_timestamp()
      where organization_id=p_organization_id and id=p_subtask_id returning * into v_sub;

      insert into public.tasks(
        id,organization_id,title,description,priority,status,assignee_id,assignee_name,
        creator_id,creator_name,due_date,start_date,location,location_required,category,
        task_type,task_type_category,proof_required,budget,spent_amount,tags,parent_task_id,
        approval_status,execution_status
      ) values(
        p_subtask_id,p_organization_id,v_sub.title,coalesce(v_sub.description,''),coalesce(v_sub.priority,'medium'),
        'scheduled',v_sub.assignee_id,v_sub.assignee_name,v_sub.created_by,
        coalesce((select u.name from public.app_users u where u.organization_id=p_organization_id and u.id=v_sub.created_by),''),
        v_sub.due_date,current_date,coalesce(v_sub.location,v_parent.location,''),
        coalesce(v_sub.location_required,false),coalesce(v_parent.category,'مهمة فرعية'),
        'مهمة فرعية',coalesce(v_parent.task_type_category,'administrative'),
        v_sub.proof_required,coalesce(v_sub.budget,0),0,array['مهمة فرعية'],p_task_id,
        'not_required','scheduled'
      ) on conflict (organization_id,id) do nothing;

      insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
      values('notif-subtask-approved-'||p_subtask_id,p_organization_id,v_sub.assignee_id,
        'تم اعتماد مهمة فرعية','تم اعتماد المهمة الفرعية وأضيفت إلى بطاقات مهامك: '||v_sub.title,'success',false,'tasks')
      on conflict (organization_id,id) do nothing;
    else
      if coalesce(nullif(btrim(p_notes),''),'')='' then raise exception using errcode='22023',message='A rejection reason is required'; end if;
      update public.task_subtasks set approval_status='rejected',is_approved=false,approved_by_manager=false,
        approved_by=v_app_user_id,approved_at=clock_timestamp(),rejection_reason=btrim(p_notes),status='rejected',updated_at=clock_timestamp()
      where organization_id=p_organization_id and id=p_subtask_id returning * into v_sub;
    end if;
  end if;

  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-subtask-state-'||gen_random_uuid()::text,p_organization_id,p_task_id,
    case when p_action='approve' then 'اعتماد المهمة الفرعية وإنشاء بطاقة مستقلة'
         when p_action='reject' then 'رفض المهمة الفرعية' else 'تحديث حالة المهمة الفرعية' end,
    v_name,coalesce(p_notes,p_status));
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-subtask-state-'||gen_random_uuid()::text,p_organization_id,v_app_user_id,v_name,v_role,
    'تغيير حالة المهمة الفرعية',case when p_action='approve' then 'approve' when p_action='reject' then 'reject' else 'update' end,
    'task',p_task_id,p_subtask_id||' | '||coalesce(p_notes,p_status,''));
  return to_jsonb(v_sub);
end;
$$;

create or replace function private.sync_subtask_card_from_task_review()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if new.parent_task_id is not null and new.status is distinct from old.status then
    if new.status in ('completed','approved') then
      update public.task_subtasks set status='completed',approval_status='approved',is_approved=true,
        approved_by_manager=true,approved_at=coalesce(approved_at,clock_timestamp()),updated_at=clock_timestamp()
      where organization_id=new.organization_id and id=new.id and task_id=new.parent_task_id;
    elsif new.status='rejected' then
      update public.task_subtasks set status='in_progress',approval_status='approved',
        rejection_reason=coalesce(new.rejection_reason,new.approval_notes),updated_at=clock_timestamp()
      where organization_id=new.organization_id and id=new.id and task_id=new.parent_task_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_sync_subtask_card_review on public.tasks;
create trigger tasks_sync_subtask_card_review
after update of status on public.tasks
for each row execute function private.sync_subtask_card_from_task_review();
