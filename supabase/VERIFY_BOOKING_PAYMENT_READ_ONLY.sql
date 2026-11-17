-- READ ONLY. Optional inspection before/after reviewed 025.
-- No personal rows, application RPC calls or changes. Keep metadata private.
begin transaction read only;
set local statement_timeout='15s';
select jsonb_pretty(jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'columns',(select jsonb_agg(jsonb_build_object('table',c.table_name,'column',c.column_name,'type',c.data_type)) from information_schema.columns c where c.table_schema='public' and (c.table_name='bookings' and c.column_name in ('payment_due_date','payment_arrangement') or c.table_name='prep_tasks' and c.column_name='booking_id')),
 'routines',(select jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'settings',p.proconfig,'body_hash',md5(p.prosrc),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('booking_payment_options_version','save_managed_booking','sync_booking_payment_reminder','validate_payment_reminder_link','booking_payment_deadline')),
 'triggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true))) from pg_trigger t where not t.tgisinternal and t.tgrelid in (to_regclass('public.bookings'),to_regclass('public.prep_tasks'))),
 'rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity)) from pg_class c where c.oid in (to_regclass('public.bookings'),to_regclass('public.prep_tasks')))
)) as booking_payment_report;
commit;
