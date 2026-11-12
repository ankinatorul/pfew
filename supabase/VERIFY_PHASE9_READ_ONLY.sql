-- READ ONLY. Optional administrator before/after check for reviewed migration 015.
-- Returns one phase9_report; no personal rows, files, credentials or RPC calls.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';
with expected_columns(table_name,column_name) as (values
 ('bookings','finance_revision'),('expenses','title'),('expenses','booking_id'),('expenses','finance_revision')
), columns as (
 select e.*,a.attnum is not null as present,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as default_value
 from expected_columns e left join pg_catalog.pg_attribute a on a.attrelid=to_regclass('public.'||e.table_name) and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
), signatures(signature) as (values
 ('public.finance_record_guard()'),('public.save_managed_booking(uuid,uuid,integer,jsonb)'),('public.change_expense(uuid,uuid,integer,jsonb,boolean)'),('public.save_monetary_budget(uuid,numeric,text,numeric,text)')
), routines as (
 select s.signature,p.oid is not null as present,pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,p.proconfig as settings,md5(p.prosrc) as body_hash,
 case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,
 case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute
 from signatures s left join pg_catalog.pg_proc p on p.oid=to_regprocedure(s.signature)
), relations as (
 select c.relname as table_name,c.relrowsecurity as rls_enabled from pg_catalog.pg_class c where c.oid in (to_regclass('public.trips'),to_regclass('public.bookings'),to_regclass('public.expenses'),to_regclass('public.budget_allocations'),to_regclass('public.budget_settings'))
), triggers as (
 select c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid where t.tgrelid in (to_regclass('public.bookings'),to_regclass('public.expenses')) and not t.tgisinternal
), constraints as (
 select c.relname as table_name,k.conname,k.convalidated,pg_get_constraintdef(k.oid,true) as definition from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid where k.conrelid in (to_regclass('public.bookings'),to_regclass('public.expenses'))
), indexes as (
 select i.relname as name,x.indisvalid,x.indisready,pg_get_indexdef(i.oid) as definition from pg_catalog.pg_index x join pg_catalog.pg_class i on i.oid=x.indexrelid where i.relname='expense_booking' and i.relnamespace='public'::regnamespace
), baselines as (
 select 'bookings' as table_name,count(*) as count,md5(coalesce(string_agg(md5((to_jsonb(b)-'finance_revision')::text),'' order by id),'')) as original_fields_fingerprint from public.bookings b
 union all select 'expenses',count(*),md5(coalesce(string_agg(md5((to_jsonb(e)-array['title','booking_id','finance_revision'])::text),'' order by id),'')) from public.expenses e
 union all select 'trips',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),'')) from public.trips t
), policies as (
 select tablename,policyname,roles,cmd,qual,with_check from pg_catalog.pg_policies where schemaname='public' and tablename in ('bookings','expenses','budget_allocations','budget_settings','trips')
)
select jsonb_pretty(jsonb_build_object(
 'report_version','pfew-phase9-v1','read_only',current_setting('transaction_read_only'),
 'columns',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.column_name) from columns c),
 'routines',(select jsonb_agg(to_jsonb(r) order by r.signature) from routines r),
 'relations',(select jsonb_agg(to_jsonb(r) order by r.table_name) from relations r),
 'triggers',(select jsonb_agg(to_jsonb(t) order by t.table_name,t.tgname) from triggers t),
 'constraints',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.conname) from constraints c),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from policies p),
 'indexes',(select jsonb_agg(to_jsonb(i)) from indexes i),
 'baselines',(select jsonb_agg(to_jsonb(b) order by b.table_name) from baselines b)
)) as phase9_report;
commit;
