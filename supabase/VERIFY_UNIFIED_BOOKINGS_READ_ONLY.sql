-- READ ONLY. Optional inspection before/after reviewed migration 018.
-- Does not run application functions or select personal booking rows.
begin transaction read only;
set local statement_timeout='15s';
select p.proname,pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
 p.proconfig as settings,md5(p.prosrc) as body_hash,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.oid in (
 to_regprocedure('public.save_managed_booking(uuid,uuid,integer,jsonb)'),
 to_regprocedure('public.managed_booking_editor_version()'))
order by p.proname;
commit;
