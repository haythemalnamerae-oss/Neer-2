-- Subtask completion updates its materialized child task through the existing outcome transition guard.
do $$
declare v_def text; v_old text; v_new text;
begin
  v_def:=pg_get_functiondef('public.set_task_subtask_state(uuid,text,text,text,text,text)'::regprocedure);
  v_old:=$old$    update public.tasks set
      status=case when p_status='completed' then 'pending_approval' when p_status='blocked' then 'paused' else p_status end,$old$;
  v_new:=$new$    perform set_config('neer.task_transition','outcome',true);
    update public.tasks set
      status=case when p_status='completed' then 'pending_approval' when p_status='blocked' then 'paused' else p_status end,$new$;
  if position(v_old in v_def)=0 then raise exception 'Subtask child-task update block not found'; end if;
  execute replace(v_def,v_old,v_new);
end;
$$;
