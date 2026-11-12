-- Parenthesize JSON text extraction before string concatenation in request notifications.
do $$
declare v_def text; v_old text; v_new text;
begin
  v_old := $old$v_name||' طلب إنشاء مهمة: '||v_payload->>'title'$old$;
  v_new := $new$v_name||' طلب إنشاء مهمة: '||(v_payload->>'title')$new$;
  v_def := pg_get_functiondef('public.create_task_request(uuid,uuid,jsonb)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception 'Expected create_task_request notification expression not found'; end if;
  execute replace(v_def,v_old,v_new);

  v_old := $old$'تم اعتماد طلبك وتحويله إلى بطاقة مهمة: '||v_payload->>'title'$old$;
  v_new := $new$'تم اعتماد طلبك وتحويله إلى بطاقة مهمة: '||(v_payload->>'title')$new$;
  v_def := pg_get_functiondef('public.review_task_request(uuid,uuid,text,text)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception 'Expected review_task_request notification expression not found'; end if;
  execute replace(v_def,v_old,v_new);
end;
$$;
