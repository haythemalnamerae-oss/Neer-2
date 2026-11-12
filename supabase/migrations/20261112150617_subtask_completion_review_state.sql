-- Keep subtask creation approval mandatory and require a separate result review after execution.
do $$
declare v_def text; v_old text; v_new text;
begin
  v_def:=pg_get_functiondef('public.create_task_subtask(uuid,text,text,jsonb)'::regprocedure);
  v_old:=$old$v_requires:=coalesce((p_payload->>'requiresApproval')::boolean,true);$old$;
  v_new:=$new$v_requires:=true;$new$;
  if position(v_old in v_def)=0 then raise exception 'Subtask approval default expression not found'; end if;
  execute replace(v_def,v_old,v_new);

  v_def:=pg_get_functiondef('public.set_task_subtask_state(uuid,text,text,text,text,text)'::regprocedure);
  v_old:=$old$update public.task_subtasks set status=p_status,
      started_at=case when p_status='in_progress' then coalesce(started_at,clock_timestamp()) else started_at end,$old$;
  v_new:=$new$update public.task_subtasks set status=p_status,
      approval_status=case when p_status='completed' then 'pending' else approval_status end,
      is_approved=case when p_status='completed' then false else is_approved end,
      approved_by_manager=case when p_status='completed' then false else approved_by_manager end,
      started_at=case when p_status='in_progress' then coalesce(started_at,clock_timestamp()) else started_at end,$new$;
  if position(v_old in v_def)=0 then raise exception 'Subtask completion state expression not found'; end if;
  execute replace(v_def,v_old,v_new);
end;
$$;
