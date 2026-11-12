-- Optional administrator check before/after reviewed migration 017.
-- READ ONLY. No application calls, personal rows or changes.
begin transaction read only;
set local statement_timeout='15s';
select jsonb_pretty(jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'payment_due_date',(
  select jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull)
  from pg_catalog.pg_attribute a where a.attrelid=to_regclass('public.bookings') and a.attname='payment_due_date' and not a.attisdropped
 ),
 'routine',(
  select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'settings',p.proconfig,'body_hash',md5(p.prosrc),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'))
  from pg_catalog.pg_proc p where p.oid=to_regprocedure('public.booking_payment_deadline()')
 ),
 'trigger',(
  select jsonb_build_object('enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) from pg_catalog.pg_trigger t
  where t.tgrelid=to_regclass('public.bookings') and t.tgname='booking_payment_deadline' and not t.tgisinternal
 ),
 'booking_baseline',(
  select jsonb_build_object('count',count(*),'original_fields_fingerprint',md5(coalesce(string_agg(md5((to_jsonb(b)-'payment_due_date')::text),'' order by id),''))) from public.bookings b
 )
)) as phase11a1_report;
commit;
