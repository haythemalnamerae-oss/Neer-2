-- Neer-2 task governance completion: request/approval separation, task type catalog,
-- assigned/dependent steps, governed subtasks, and auditable workflow RPCs.
-- Additive only: existing task/financial history is retained.

create table if not exists public.task_types (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label_ar text not null,
  category text not null check (category in ('administrative','field','financial','visit')),
  active boolean not null default true,
  location_required boolean not null default false,
  proof_required text,
  approval_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,key)
);
alter table public.task_types enable row level security;
drop policy if exists task_types_scoped_read on public.task_types;
create policy task_types_scoped_read on public.task_types
for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.task_types from anon;
grant select on public.task_types to authenticated;

insert into public.task_types(organization_id,key,label_ar,category,location_required,proof_required,approval_required,sort_order)
select o.id,v.key,v.label_ar,v.category,v.location_required,v.proof_required,v.approval_required,v.sort_order
from public.organizations o
cross join (values
 ('field_maintenance','صيانة وتشغيل ميداني','field',true,'صور قبل وبعد ومحضر التنفيذ',true,10),
 ('customer_visit','زيارة عميل / تفتيش دوري','visit',true,'تقرير الزيارة وصورة الموقع',true,20),
 ('supply_installation','توريد وتركيب معدات','field',true,'محضر استلام وتركيب',true,30),
 ('financial_collection','تحصيل مالي','financial',true,'سند قبض أو إثبات تحويل',true,40),
 ('bank_deposit','إيداع بنكي للمتحصلات','financial',true,'إشعار الإيداع البنكي',true,50),
 ('procurement','شراء مواد ومستلزمات','administrative',false,'فاتورة الشراء',true,60),
 ('hse_inspection','فحص سلامة وجودة','field',true,'قائمة فحص وصور',true,70),
 ('urgent_incident','مهمة عاجلة وطارئة','field',true,'تقرير الإجراء والإثباتات',true,80)
) as v(key,label_ar,category,location_required,proof_required,approval_required,sort_order)
on conflict (organization_id,key) do nothing;

create table if not exists public.task_requests (
  id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by text not null,
  requested_by_name text not null default '',
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  status text not null default 'submitted'
    check (status in ('submitted','changes_requested','approved','rejected','converted','cancelled')),
  review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,id),
  foreign key (organization_id,requested_by) references public.app_users(organization_id,id) on delete restrict
);
create index if not exists task_requests_org_status_created_idx
  on public.task_requests(organization_id,status,created_at desc);
create index if not exists task_requests_org_requester_created_idx
  on public.task_requests(organization_id,requested_by,created_at desc);
alter table public.task_requests enable row level security;
drop policy if exists task_requests_scoped_read on public.task_requests;
create policy task_requests_scoped_read on public.task_requests
for select to authenticated
using (
  private.is_org_member(organization_id)
  and (
    requested_by = (select m.app_user_id from public.organization_members m
      where m.organization_id=task_requests.organization_id and m.auth_user_id=(select auth.uid()) and m.active limit 1)
    or exists (
      select 1 from public.organization_members m
      join public.role_permissions rp on rp.organization_id=m.organization_id and rp.role_key=m.role
      where m.organization_id=task_requests.organization_id and m.auth_user_id=(select auth.uid()) and m.active
        and rp.permission_key='tasks.approve' and rp.granted
    )
  )
);
revoke all on public.task_requests from anon,authenticated;
grant select on public.task_requests to authenticated;

alter table public.tasks
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists execution_status text not null default 'scheduled',
  add column if not exists task_type_key text,
  add column if not exists task_request_id uuid,
  add column if not exists requested_by text;

alter table public.tasks drop constraint if exists tasks_approval_status_check;
alter table public.tasks add constraint tasks_approval_status_check
  check (approval_status in ('not_required','pending','approved','rejected')) not valid;
alter table public.tasks validate constraint tasks_approval_status_check;
alter table public.tasks drop constraint if exists tasks_execution_status_check;
alter table public.tasks add constraint tasks_execution_status_check
  check (execution_status in ('not_started','scheduled','in_progress','paused','completed','deferred','cancelled','needs_changes')) not valid;
alter table public.tasks validate constraint tasks_execution_status_check;

alter table public.tasks drop constraint if exists tasks_org_task_type_key_fkey;
alter table public.tasks add constraint tasks_org_task_type_key_fkey
  foreign key (organization_id,task_type_key) references public.task_types(organization_id,key)
  on update cascade on delete set null not valid;
alter table public.tasks validate constraint tasks_org_task_type_key_fkey;
alter table public.tasks drop constraint if exists tasks_org_task_request_fkey;
alter table public.tasks add constraint tasks_org_task_request_fkey
  foreign key (organization_id,task_request_id) references public.task_requests(organization_id,id)
  on delete set null not valid;
alter table public.tasks validate constraint tasks_org_task_request_fkey;
alter table public.tasks drop constraint if exists tasks_org_requested_by_fkey;
alter table public.tasks add constraint tasks_org_requested_by_fkey
  foreign key (organization_id,requested_by) references public.app_users(organization_id,id)
  on delete set null not valid;
alter table public.tasks validate constraint tasks_org_requested_by_fkey;
create unique index if not exists tasks_org_task_request_uidx
  on public.tasks(organization_id,task_request_id) where task_request_id is not null;

update public.tasks set
  approval_status = case
    when status='pending_approval' then 'pending'
    when status in ('completed','approved') then 'approved'
    when status='rejected' then 'rejected'
    else 'not_required' end,
  execution_status = case
    when status in ('completed','approved','pending_approval') then 'completed'
    when status in ('started','in_progress') then 'in_progress'
    when status='paused' then 'paused'
    when status='deferred' then 'deferred'
    when status='cancelled' then 'cancelled'
    when status='rejected' then 'needs_changes'
    when status in ('new','todo') then 'not_started'
    else 'scheduled' end;

create or replace function private.sync_task_governance_status()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_transition text := coalesce(current_setting('neer.task_transition',true),'');
begin
  if tg_op='UPDATE' then
    if new.approval_status is distinct from old.approval_status and v_transition not in ('review','outcome','task_request_review') then
      raise exception using errcode='42501',message='Task approval status must be changed through the audited review workflow';
    end if;
    if new.execution_status is distinct from old.execution_status and v_transition not in ('review','outcome','task_request_review','lifecycle') then
      raise exception using errcode='42501',message='Task execution status must be changed through the task lifecycle workflow';
    end if;
    if new.status is distinct from old.status and new.status in ('pending_approval','completed','approved','rejected')
       and v_transition not in ('review','outcome','task_request_review') then
      raise exception using errcode='42501',message='Task approval transitions must use the audited review workflow';
    end if;
  end if;

  if new.status='pending_approval' then
    new.approval_status := 'pending';
    new.execution_status := 'completed';
  elsif new.status in ('completed','approved') then
    new.approval_status := 'approved';
    new.execution_status := 'completed';
  elsif new.status='rejected' then
    new.approval_status := 'rejected';
    new.execution_status := 'needs_changes';
  elsif new.status in ('started','in_progress') then
    new.approval_status := 'not_required';
    new.execution_status := 'in_progress';
  elsif new.status='paused' then
    new.approval_status := 'not_required';
    new.execution_status := 'paused';
  elsif new.status='deferred' then
    new.approval_status := 'not_required';
    new.execution_status := 'deferred';
  elsif new.status='cancelled' then
    new.approval_status := 'not_required';
    new.execution_status := 'cancelled';
  elsif new.status in ('new','todo') then
    new.approval_status := 'not_required';
    new.execution_status := 'not_started';
  elsif new.approval_status='not_required' and new.execution_status='not_started' then
    new.execution_status := 'scheduled';
  end if;
  new.updated_at := coalesce(new.updated_at,clock_timestamp());
  return new;
end;
$$;
drop trigger if exists tasks_sync_governance_status on public.tasks;
create trigger tasks_sync_governance_status
before insert or update on public.tasks
for each row execute function private.sync_task_governance_status();

alter table public.task_steps
  add column if not exists assigned_to text,
  add column if not exists assigned_by text,
  add column if not exists created_by text,
  add column if not exists approval_required boolean not null default false,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists depends_on_step_id text;
alter table public.task_steps drop constraint if exists task_steps_approval_status_check;
alter table public.task_steps add constraint task_steps_approval_status_check
  check (approval_status in ('not_required','pending','approved','rejected')) not valid;
alter table public.task_steps validate constraint task_steps_approval_status_check;
alter table public.task_steps drop constraint if exists task_steps_org_assignee_fkey;
alter table public.task_steps add constraint task_steps_org_assignee_fkey
  foreign key (organization_id,assigned_to) references public.app_users(organization_id,id) on delete set null not valid;
alter table public.task_steps validate constraint task_steps_org_assignee_fkey;
alter table public.task_steps drop constraint if exists task_steps_org_dependency_fkey;
alter table public.task_steps add constraint task_steps_org_dependency_fkey
  foreign key (organization_id,depends_on_step_id) references public.task_steps(organization_id,id) on delete set null not valid;
alter table public.task_steps validate constraint task_steps_org_dependency_fkey;
create index if not exists task_steps_org_assignee_idx on public.task_steps(organization_id,assigned_to);
create index if not exists task_steps_org_dependency_idx on public.task_steps(organization_id,depends_on_step_id);

alter table public.task_subtasks
  add column if not exists created_by text,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists priority text not null default 'medium',
  add column if not exists description text not null default '',
  add column if not exists location text not null default '',
  add column if not exists location_required boolean not null default false,
  add column if not exists proof_required text,
  add column if not exists proof_attachment_url text,
  add column if not exists budget numeric not null default 0;
alter table public.task_subtasks drop constraint if exists task_subtasks_approval_status_check;
alter table public.task_subtasks add constraint task_subtasks_approval_status_check
  check (approval_status in ('not_required','pending','approved','rejected')) not valid;
alter table public.task_subtasks validate constraint task_subtasks_approval_status_check;
alter table public.task_subtasks drop constraint if exists task_subtasks_priority_check;
alter table public.task_subtasks add constraint task_subtasks_priority_check
  check (priority in ('urgent','high','medium','low')) not valid;
alter table public.task_subtasks validate constraint task_subtasks_priority_check;
alter table public.task_subtasks drop constraint if exists task_subtasks_org_assignee_fkey;
alter table public.task_subtasks add constraint task_subtasks_org_assignee_fkey
  foreign key (organization_id,assignee_id) references public.app_users(organization_id,id) on delete set null not valid;
alter table public.task_subtasks validate constraint task_subtasks_org_assignee_fkey;
create index if not exists task_subtasks_org_assignee_idx on public.task_subtasks(organization_id,assignee_id);

create or replace function public.create_task_request(
  p_organization_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_app_user_id text; v_role text; v_name text; v_payload jsonb;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_organization_id is null or p_request_id is null or jsonb_typeof(p_payload)<>'object'
     or length(p_payload::text)>30000 or coalesce(nullif(btrim(p_payload->>'title'),''),'')=''
     or length(p_payload->>'title')>240 then
    raise exception using errcode='22023',message='Invalid task request payload';
  end if;
  select m.app_user_id,m.role,u.name into v_app_user_id,v_role,v_name
  from public.organization_members m
  join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id and u.active
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active
  limit 1;
  if not found or v_app_user_id is null then raise exception using errcode='42501',message='Active operational membership required'; end if;
  if v_role not in ('admin','ops_manager','field_officer') then
    raise exception using errcode='42501',message='This role cannot submit task requests';
  end if;
  v_payload := p_payload;
  if v_role='field_officer' then
    v_payload := jsonb_set(v_payload,'{assigneeId}',to_jsonb(v_app_user_id),true);
    v_payload := jsonb_set(v_payload,'{assigneeIds}',jsonb_build_array(v_app_user_id),true);
  end if;
  if nullif(v_payload->>'dueDate','') is null or (v_payload->>'dueDate') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode='22023',message='A valid due date is required';
  end if;
  if nullif(v_payload->>'taskTypeKey','') is not null and not exists (
    select 1 from public.task_types tt where tt.organization_id=p_organization_id and tt.key=v_payload->>'taskTypeKey' and tt.active
  ) then raise exception using errcode='22023',message='Unknown or inactive task type'; end if;
  insert into public.task_requests(id,organization_id,requested_by,requested_by_name,payload,status)
  values(p_request_id,p_organization_id,v_app_user_id,v_name,v_payload,'submitted');
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-task-request-'||p_request_id::text,p_organization_id,v_app_user_id,v_name,v_role,'طلب إنشاء مهمة','create','task','request:'||p_request_id::text,v_payload->>'title');
  insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
  select 'notif-task-request-'||p_request_id::text||'-'||m.app_user_id,p_organization_id,m.app_user_id,
    'طلب مهمة جديد',v_name||' طلب إنشاء مهمة: '||v_payload->>'title','info',false,'tasks'
  from public.organization_members m
  where m.organization_id=p_organization_id and m.active and m.app_user_id is not null
    and (m.role='admin' or exists(select 1 from public.role_permissions rp where rp.organization_id=m.organization_id and rp.role_key=m.role and rp.permission_key='tasks.approve' and rp.granted))
  on conflict (organization_id,id) do nothing;
  return jsonb_build_object('request_id',p_request_id,'status','submitted');
end;
$$;

create or replace function public.review_task_request(
  p_organization_id uuid,
  p_request_id uuid,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_request public.task_requests%rowtype;
  v_reviewer_id text;
  v_reviewer_name text;
  v_role text;
  v_task_id text;
  v_payload jsonb;
  v_task jsonb;
  v_result jsonb;
  v_assignee text;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_action not in ('approve','reject','changes_requested') then raise exception using errcode='22023',message='Unsupported request review action'; end if;
  if p_action in ('reject','changes_requested') and coalesce(nullif(btrim(p_notes),''),'')='' then
    raise exception using errcode='22023',message='A reason is required';
  end if;
  select m.app_user_id,m.role,u.name into v_reviewer_id,v_role,v_reviewer_name
  from public.organization_members m
  join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id and u.active
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active limit 1;
  if not found or v_reviewer_id is null then raise exception using errcode='42501',message='Active operational membership required'; end if;
  if v_role<>'admin' and not exists(select 1 from public.role_permissions rp where rp.organization_id=p_organization_id and rp.role_key=v_role and rp.permission_key='tasks.approve' and rp.granted) then
    raise exception using errcode='42501',message='Task approval permission required';
  end if;
  select * into v_request from public.task_requests
  where organization_id=p_organization_id and id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Task request not found'; end if;
  if v_request.requested_by=v_reviewer_id then raise exception using errcode='42501',message='Request creators cannot review their own requests'; end if;
  if v_request.status not in ('submitted','changes_requested') then
    raise exception using errcode='22023',message='Task request is not awaiting review';
  end if;
  if p_action='approve' then
    if v_role<>'admin' and not exists(select 1 from public.role_permissions rp where rp.organization_id=p_organization_id and rp.role_key=v_role and rp.permission_key='tasks.create' and rp.granted) then
      raise exception using errcode='42501',message='Task creation permission required to convert an approved request';
    end if;
    v_payload:=v_request.payload;
    v_assignee:=coalesce(nullif(v_payload->>'assigneeId',''),v_request.requested_by);
    if not exists(select 1 from public.app_users u where u.organization_id=p_organization_id and u.id=v_assignee and u.active) then
      raise exception using errcode='23503',message='Requested assignee is not active';
    end if;
    v_task_id:='tsk-'||replace(p_request_id::text,'-','');
    v_task:=jsonb_build_object(
      'id',v_task_id,'title',v_payload->>'title','description',coalesce(v_payload->>'description',''),
      'priority',coalesce(v_payload->>'priority','medium'),'assigneeId',v_assignee,
      'assigneeIds',coalesce(v_payload->'assigneeIds',jsonb_build_array(v_assignee)),
      'supervisors',coalesce(v_payload->'supervisors','[]'::jsonb),
      'dueDate',v_payload->>'dueDate','startDate',coalesce(v_payload->>'startDate',current_date::text),
      'dueTime',v_payload->>'dueTime','location',coalesce(v_payload->>'location',''),
      'locationRequired',coalesce((v_payload->>'locationRequired')::boolean,false),
      'category',coalesce(v_payload->>'category',''),'taskType',coalesce(v_payload->>'taskType',''),
      'taskTypeCategory',coalesce(v_payload->>'taskTypeCategory','administrative'),
      'clientName',v_payload->>'clientName','clientPhone',v_payload->>'clientPhone',
      'proofRequired',v_payload->>'proofRequired','budget',coalesce(v_payload->>'budget','0'),
      'tags',coalesce(v_payload->'tags','[]'::jsonb),'fundId',v_payload->>'fundId',
      'taskFundAmount',v_payload->>'taskFundAmount','notes',v_payload->>'notes',
      'standingAccountId',v_payload->>'standingAccountId'
    );
    perform set_config('neer.task_transition','task_request_review',true);
    v_result:=public.create_task_bundle(p_organization_id,v_task,coalesce(v_payload->'checklist','[]'::jsonb),coalesce(v_payload->'steps','[]'::jsonb),null);
    update public.tasks set task_request_id=p_request_id,requested_by=v_request.requested_by,task_type_key=nullif(v_payload->>'taskTypeKey','')
    where organization_id=p_organization_id and id=v_task_id;
    update public.task_requests set status='converted',review_notes=nullif(btrim(p_notes),''),reviewed_by=v_reviewer_id,reviewed_at=clock_timestamp(),task_id=v_task_id,updated_at=clock_timestamp()
    where organization_id=p_organization_id and id=p_request_id;
    insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
    values('notif-task-request-approved-'||p_request_id::text,p_organization_id,v_request.requested_by,'تم اعتماد طلب المهمة','تم اعتماد طلبك وتحويله إلى بطاقة مهمة: '||v_payload->>'title','success',false,'tasks')
    on conflict (organization_id,id) do nothing;
    return jsonb_build_object('request_id',p_request_id,'status','converted','task_id',v_task_id,'task',v_result->'task');
  end if;
  update public.task_requests set status=p_action,review_notes=nullif(btrim(p_notes),''),reviewed_by=v_reviewer_id,reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
  where organization_id=p_organization_id and id=p_request_id;
  insert into public.notifications(id,organization_id,user_id,title,message,type,is_read,target_view)
  values('notif-task-request-review-'||p_request_id::text,p_organization_id,v_request.requested_by,
    case when p_action='reject' then 'تم رفض طلب المهمة' else 'طلب المهمة يحتاج إلى تعديل' end,
    coalesce(p_notes,''),'alert',false,'tasks')
  on conflict (organization_id,id) do nothing;
  return jsonb_build_object('request_id',p_request_id,'status',p_action);
end;
$$;

create or replace function public.create_task_subtask(
  p_organization_id uuid,p_task_id text,p_subtask_id text,p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_app_user_id text; v_role text; v_name text; v_assignee text; v_assignee_name text; v_requires boolean;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if jsonb_typeof(p_payload)<>'object' or coalesce(nullif(btrim(p_payload->>'title'),''),'')='' then
    raise exception using errcode='22023',message='Subtask title is required';
  end if;
  select m.app_user_id,m.role,u.name into v_app_user_id,v_role,v_name
  from public.organization_members m join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id and u.active
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active limit 1;
  if not found or v_app_user_id is null then raise exception using errcode='42501',message='Active operational membership required'; end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then raise exception using errcode='42501',message='Task edit permission required'; end if;
  v_assignee:=coalesce(nullif(p_payload->>'assigneeId',''),v_app_user_id);
  if v_role='field_officer' and v_assignee<>v_app_user_id then raise exception using errcode='42501',message='Field officers may only assign subtasks to themselves'; end if;
  select name into v_assignee_name from public.app_users where organization_id=p_organization_id and id=v_assignee and active;
  if not found then raise exception using errcode='23503',message='Active subtask assignee not found'; end if;
  v_requires:=coalesce((p_payload->>'requiresApproval')::boolean,true);
  insert into public.task_subtasks(
    id,organization_id,task_id,title,assignee_id,assignee_name,status,requires_approval,is_approved,approved_by_manager,
    due_date,notes,created_by,approval_status,priority,description,location,location_required,proof_required,budget
  ) values (
    p_subtask_id,p_organization_id,p_task_id,trim(p_payload->>'title'),v_assignee,v_assignee_name,
    case when v_requires then 'pending_approval' else 'scheduled' end,
    v_requires,not v_requires,false,nullif(p_payload->>'dueDate','')::date,nullif(p_payload->>'notes',''),
    v_app_user_id,case when v_requires then 'pending' else 'not_required' end,
    coalesce(p_payload->>'priority','medium'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'location',''),
    coalesce((p_payload->>'locationRequired')::boolean,false),nullif(p_payload->>'proofRequired',''),greatest(coalesce((p_payload->>'budget')::numeric,0),0)
  );
  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-subtask-'||p_subtask_id,p_organization_id,p_task_id,'إضافة مهمة فرعية بانتظار الاعتماد',v_name,trim(p_payload->>'title'));
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-subtask-'||p_subtask_id,p_organization_id,v_app_user_id,v_name,v_role,'إنشاء مهمة فرعية','create','task',p_task_id,p_subtask_id);
  return to_jsonb((select s from public.task_subtasks s where s.organization_id=p_organization_id and s.id=p_subtask_id));
end;
$$;

create or replace function public.set_task_subtask_state(
  p_organization_id uuid,p_task_id text,p_subtask_id text,p_action text,p_status text default null,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_sub public.task_subtasks%rowtype; v_app_user_id text; v_role text; v_name text;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_action not in ('update','approve','reject') then raise exception using errcode='22023',message='Unsupported subtask action'; end if;
  select m.app_user_id,m.role,u.name into v_app_user_id,v_role,v_name
  from public.organization_members m join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id and u.active
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active limit 1;
  if not found then raise exception using errcode='42501',message='Active operational membership required'; end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then raise exception using errcode='42501',message='Task edit permission required'; end if;
  select * into v_sub from public.task_subtasks where organization_id=p_organization_id and task_id=p_task_id and id=p_subtask_id for update;
  if not found then raise exception using errcode='P0002',message='Subtask not found'; end if;
  if p_action='update' then
    if v_sub.assignee_id is not null and v_sub.assignee_id<>v_app_user_id and v_role='field_officer' then
      raise exception using errcode='42501',message='Only the assigned field officer can update this subtask';
    end if;
    if p_status not in ('scheduled','in_progress','completed','blocked','deferred') then raise exception using errcode='22023',message='Invalid subtask status'; end if;
    if v_sub.approval_status='pending' or v_sub.approval_status='rejected' then raise exception using errcode='42501',message='Subtask must be approved before execution'; end if;
    update public.task_subtasks set status=p_status,started_at=case when p_status='in_progress' then coalesce(started_at,clock_timestamp()) else started_at end,
      completed_at=case when p_status='completed' then clock_timestamp() else null end,notes=coalesce(p_notes,notes),updated_at=clock_timestamp()
    where organization_id=p_organization_id and id=p_subtask_id returning * into v_sub;
  else
    if v_role<>'admin' and not exists(select 1 from public.role_permissions rp where rp.organization_id=p_organization_id and rp.role_key=v_role and rp.permission_key='tasks.approve' and rp.granted) then
      raise exception using errcode='42501',message='Task approval permission required';
    end if;
    if v_sub.created_by=v_app_user_id then raise exception using errcode='42501',message='Subtask creator cannot review own subtask'; end if;
    if v_sub.approval_status<>'pending' then raise exception using errcode='22023',message='Subtask is not awaiting approval'; end if;
    if p_action='approve' then
      update public.task_subtasks set approval_status='approved',is_approved=true,approved_by_manager=true,approved_by=v_app_user_id,approved_at=clock_timestamp(),status='scheduled',updated_at=clock_timestamp()
      where organization_id=p_organization_id and id=p_subtask_id returning * into v_sub;
    else
      if coalesce(nullif(btrim(p_notes),''),'')='' then raise exception using errcode='22023',message='A rejection reason is required'; end if;
      update public.task_subtasks set approval_status='rejected',is_approved=false,approved_by_manager=false,approved_by=v_app_user_id,approved_at=clock_timestamp(),rejection_reason=btrim(p_notes),status='rejected',updated_at=clock_timestamp()
      where organization_id=p_organization_id and id=p_subtask_id returning * into v_sub;
    end if;
  end if;
  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-subtask-state-'||gen_random_uuid()::text,p_organization_id,p_task_id,
    case when p_action='approve' then 'اعتماد المهمة الفرعية' when p_action='reject' then 'رفض المهمة الفرعية' else 'تحديث حالة المهمة الفرعية' end,
    v_name,coalesce(p_notes,p_status));
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-subtask-state-'||gen_random_uuid()::text,p_organization_id,v_app_user_id,v_name,v_role,
    'تغيير حالة المهمة الفرعية',case when p_action='approve' then 'approve' when p_action='reject' then 'reject' else 'update' end,
    'task',p_task_id,p_subtask_id||' | '||coalesce(p_notes,p_status,''));
  return to_jsonb(v_sub);
end;
$$;

create or replace function public.set_task_step_state(
  p_organization_id uuid,p_task_id text,p_step_id text,p_action text,p_status text default null,
  p_notes text default null,p_next_step_date date default null,p_assignee_id text default null,
  p_depends_on_step_id text default null,p_approval_required boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_step public.task_steps%rowtype; v_app_user_id text; v_role text; v_name text; v_dependency public.task_steps%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_action not in ('update','configure','approve','reject') then raise exception using errcode='22023',message='Unsupported step action'; end if;
  select m.app_user_id,m.role,u.name into v_app_user_id,v_role,v_name
  from public.organization_members m join public.app_users u on u.organization_id=m.organization_id and u.id=m.app_user_id and u.active
  where m.organization_id=p_organization_id and m.auth_user_id=auth.uid() and m.active limit 1;
  if not found then raise exception using errcode='42501',message='Active operational membership required'; end if;
  if not private.can_access_task(p_organization_id,p_task_id,'edit') then raise exception using errcode='42501',message='Task edit permission required'; end if;
  select * into v_step from public.task_steps where organization_id=p_organization_id and task_id=p_task_id and id=p_step_id for update;
  if not found then raise exception using errcode='P0002',message='Task step not found'; end if;
  if p_action in ('approve','reject') then
    if v_role<>'admin' and not exists(select 1 from public.role_permissions rp where rp.organization_id=p_organization_id and rp.role_key=v_role and rp.permission_key='tasks.approve' and rp.granted) then
      raise exception using errcode='42501',message='Task approval permission required';
    end if;
    if v_step.created_by=v_app_user_id then raise exception using errcode='42501',message='Step creator cannot review own step'; end if;
    if v_step.approval_status<>'pending' then raise exception using errcode='22023',message='Step is not awaiting approval'; end if;
    if p_action='approve' then
      update public.task_steps set approval_status='approved',approved_by=v_app_user_id,approved_at=clock_timestamp(),rejection_reason=null
      where organization_id=p_organization_id and id=p_step_id returning * into v_step;
    else
      if coalesce(nullif(btrim(p_notes),''),'')='' then raise exception using errcode='22023',message='A rejection reason is required'; end if;
      update public.task_steps set approval_status='rejected',status='in_progress',approved_by=v_app_user_id,approved_at=clock_timestamp(),rejection_reason=btrim(p_notes)
      where organization_id=p_organization_id and id=p_step_id returning * into v_step;
    end if;
  else
    if v_step.assigned_to is not null and v_step.assigned_to<>v_app_user_id and v_role='field_officer' then
      raise exception using errcode='42501',message='Only the assigned field officer can change this step';
    end if;
    if p_action='configure' then
      if p_assignee_id is not null and not exists(select 1 from public.app_users u where u.organization_id=p_organization_id and u.id=p_assignee_id and u.active) then
        raise exception using errcode='23503',message='Active step assignee not found';
      end if;
      if p_depends_on_step_id=p_step_id then raise exception using errcode='22023',message='A step cannot depend on itself'; end if;
      if p_depends_on_step_id is not null and not exists(select 1 from public.task_steps s where s.organization_id=p_organization_id and s.task_id=p_task_id and s.id=p_depends_on_step_id) then
        raise exception using errcode='23503',message='Dependency must belong to the same task';
      end if;
      update public.task_steps set assigned_to=p_assignee_id,approval_required=coalesce(p_approval_required,approval_required),depends_on_step_id=p_depends_on_step_id
      where organization_id=p_organization_id and id=p_step_id returning * into v_step;
    else
      if p_status not in ('pending','in_progress','completed','blocked','deferred') then raise exception using errcode='22023',message='Invalid step status'; end if;
      if v_step.approval_status='pending' then raise exception using errcode='42501',message='Step is awaiting approval'; end if;
      if p_status in ('in_progress','completed') and v_step.depends_on_step_id is not null then
        select * into v_dependency from public.task_steps where organization_id=p_organization_id and task_id=p_task_id and id=v_step.depends_on_step_id;
        if v_dependency.status<>'completed' or (v_dependency.approval_required and v_dependency.approval_status<>'approved') then
          raise exception using errcode='23514',message='The prerequisite step must be completed and approved first';
        end if;
      end if;
      update public.task_steps set status=p_status,notes=coalesce(p_notes,notes),next_step_date=coalesce(p_next_step_date,next_step_date),
        completed_at=case when p_status='completed' then clock_timestamp() else null end,
        approval_status=case when p_status='completed' and approval_required then 'pending' when p_status='completed' then 'not_required' else approval_status end,
        approved_by=null,approved_at=null,rejection_reason=null
      where organization_id=p_organization_id and id=p_step_id returning * into v_step;
    end if;
  end if;
  insert into public.task_history(id,organization_id,task_id,action,performed_by,notes)
  values('hist-step-state-'||gen_random_uuid()::text,p_organization_id,p_task_id,
    case when p_action='approve' then 'اعتماد المرحلة' when p_action='reject' then 'رفض المرحلة' else 'تحديث المرحلة' end,
    v_name,coalesce(p_notes,p_status,p_action));
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  values('aud-step-state-'||gen_random_uuid()::text,p_organization_id,v_app_user_id,v_name,v_role,
    'تغيير حالة المرحلة',case when p_action='approve' then 'approve' when p_action='reject' then 'reject' else 'update' end,
    'task',p_task_id,p_step_id||' | '||coalesce(p_notes,p_status,p_action));
  return to_jsonb(v_step);
end;
$$;

-- Step creation defaults to the task's primary executor and records the creator.
create or replace function private.initialize_task_step()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if new.assigned_to is null then
    select t.assignee_id into new.assigned_to from public.tasks t
    where t.organization_id=new.organization_id and t.id=new.task_id;
  end if;
  if new.created_by is null then
    select m.app_user_id into new.created_by from public.organization_members m
    where m.organization_id=new.organization_id and m.auth_user_id=auth.uid() and m.active limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists task_steps_initialize_owner on public.task_steps;
create trigger task_steps_initialize_owner before insert on public.task_steps
for each row execute function private.initialize_task_step();

revoke all on function public.create_task_request(uuid,uuid,jsonb) from public,anon;
revoke all on function public.review_task_request(uuid,uuid,text,text) from public,anon;
revoke all on function public.create_task_subtask(uuid,text,text,jsonb) from public,anon;
revoke all on function public.set_task_subtask_state(uuid,text,text,text,text,text) from public,anon;
revoke all on function public.set_task_step_state(uuid,text,text,text,text,text,date,text,text,boolean) from public,anon;
grant execute on function public.create_task_request(uuid,uuid,jsonb) to authenticated;
grant execute on function public.review_task_request(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_task_subtask(uuid,text,text,jsonb) to authenticated;
grant execute on function public.set_task_subtask_state(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.set_task_step_state(uuid,text,text,text,text,text,date,text,text,boolean) to authenticated;
