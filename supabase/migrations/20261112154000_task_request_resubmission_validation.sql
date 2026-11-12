create or replace function public.resubmit_task_request(
  p_organization_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_app_user_id text; v_role text; v_request public.task_requests%rowtype; v_payload jsonb;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_organization_id is null or p_request_id is null or jsonb_typeof(p_payload)<>'object'
     or length(p_payload::text)>30000 or coalesce(nullif(btrim(p_payload->>'title'),''),'')=''
     or length(p_payload->>'title')>240
     or nullif(p_payload->>'dueDate','') is null
     or (p_payload->>'dueDate') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce((p_payload->>'budget')::numeric,0)<0 then
    raise exception using errcode='22023',message='A valid title, due date, and non-negative budget are required';
  end if;
  select app_user_id,role into v_app_user_id,v_role from public.organization_members
  where organization_id=p_organization_id and auth_user_id=auth.uid() and active limit 1;
  if not found or v_app_user_id is null then raise exception using errcode='42501',message='Active operational membership required'; end if;
  select * into v_request from public.task_requests
  where organization_id=p_organization_id and id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Task request not found'; end if;
  if v_request.requested_by<>v_app_user_id then raise exception using errcode='42501',message='Only the request owner may resubmit it'; end if;
  if v_request.status<>'changes_requested' then raise exception using errcode='22023',message='Only requests returned for changes may be resubmitted'; end if;
  v_payload:=p_payload;
  if v_role='field_officer' then
    v_payload:=jsonb_set(v_payload,'{assigneeId}',to_jsonb(v_app_user_id),true);
    v_payload:=jsonb_set(v_payload,'{assigneeIds}',jsonb_build_array(v_app_user_id),true);
  end if;
  if nullif(v_payload->>'taskTypeKey','') is not null and not exists(
    select 1 from public.task_types tt where tt.organization_id=p_organization_id and tt.key=v_payload->>'taskTypeKey' and tt.active
  ) then raise exception using errcode='22023',message='Unknown or inactive task type'; end if;
  update public.task_requests set payload=v_payload,status='submitted',review_notes=null,reviewed_by=null,reviewed_at=null,updated_at=clock_timestamp()
  where organization_id=p_organization_id and id=p_request_id;
  insert into public.audit_logs(id,organization_id,user_id,user_name,user_role,action,action_type,entity,entity_id,details)
  select 'aud-task-request-resubmit-'||p_request_id::text,p_organization_id,v_app_user_id,u.name,v_role,'إعادة إرسال طلب مهمة بعد التعديل','update','task','request:'||p_request_id::text,v_payload->>'title'
  from public.app_users u where u.organization_id=p_organization_id and u.id=v_app_user_id
  on conflict (organization_id,id) do nothing;
  return jsonb_build_object('request_id',p_request_id,'status','submitted');
end;
$$;
revoke all on function public.resubmit_task_request(uuid,uuid,jsonb) from public,anon;
grant execute on function public.resubmit_task_request(uuid,uuid,jsonb) to authenticated;
