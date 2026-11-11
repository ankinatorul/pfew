-- AUDIT ONLY. Copy this WHOLE file into a new Supabase SQL Editor query.
-- It runs no application RPC, migration, fixture write or configuration change.
-- Works on the expected 001–009 baseline and after 010–013.
-- One result: export phase7_report privately. Contains catalogs/aggregate hashes,
-- not personal trip/booking/account/file rows. Policy expressions remain private.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';
with expected_columns(table_name,column_name) as (values
 ('trips','creation_state'),('trips','draft_data'),('trips','draft_step'),('trips','draft_revision'),('trips','theme'),
 ('bookings','reservation_status'),('booking_attachments','intake_id'),('booking_attachments','content_sha256'),('trip_onboarding','updated_at')
), columns as (
 select e.*,a.attnum is not null as present,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as default_value
 from expected_columns e left join pg_catalog.pg_attribute a on a.attrelid=to_regclass('public.'||e.table_name) and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
), expected_rpcs(signature) as (values
 ('public.save_trip_draft(uuid,integer,jsonb)'),('public.accept_ai_idea(uuid)'),
 ('public.save_booking_intake(uuid,uuid,integer,jsonb,boolean)'),('public.advance_booking_collection(uuid)'),
 ('public.save_reviewed_booking(uuid,uuid,text,boolean,jsonb)'),('public.materialize_booking_intake(uuid,uuid,integer)'),
 ('public.save_trip_review(uuid,integer,text)'),('public.finalize_trip_draft(uuid,integer,text,jsonb,text)')
), rpcs as (
 select e.signature,p.oid is not null as present,pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,p.proconfig as settings,
 case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,
 case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute,
 md5(p.prosrc) as body_hash
 from expected_rpcs e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), relations as (
 select c.oid,c.relname as table_name,c.relrowsecurity as rls_enabled,pg_get_userbyid(c.relowner) as owner
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p')
), dangerous_grants as (
 select r.table_name,role_name,has_table_privilege(role_name,r.oid,'TRUNCATE') as can_truncate
 from relations r cross join (values ('anon'::text),('authenticated'::text)) roles(role_name)
), constraints as (
 select c.relname as table_name,k.conname,k.convalidated,pg_get_constraintdef(k.oid,true) as definition
 from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
 where k.conrelid in (to_regclass('public.trips'),to_regclass('public.bookings'),to_regclass('public.booking_attachments'),to_regclass('public.trip_onboarding'))
), policies as (
 select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_catalog.pg_policies
 where schemaname='public' or schemaname='storage' and tablename in ('objects','buckets')
), triggers as (
 select c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition
 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
 where not t.tgisinternal and t.tgrelid in (to_regclass('public.trips'),to_regclass('public.bookings'),to_regclass('public.booking_attachments'),to_regclass('public.trip_onboarding'))
), bucket as (
 select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='booking-files'
), trip_baseline as (
 select count(*) as count,count(*) filter(where start_date is null or end_date is null or end_date<start_date) as invalid_dates,
 md5(coalesce(string_agg(md5((to_jsonb(t)-array['creation_state','draft_data','draft_step','draft_revision','theme'])::text),'' order by id),'')) as original_fields_fingerprint from public.trips t
), booking_baseline as (
 select count(*) as count,md5(coalesce(string_agg(md5((to_jsonb(b)-'reservation_status')::text),'' order by id),'')) as original_fields_fingerprint from public.bookings b
), attachment_baseline as (
 select count(*) as count,md5(coalesce(string_agg(md5((to_jsonb(a)-array['intake_id','content_sha256'])::text),'' order by id),'')) as original_fields_fingerprint from public.booking_attachments a
), broken_links as (
 select (select count(*) from public.bookings b left join public.trips t on t.id=b.trip_id where t.id is null) as orphan_bookings,
 (select count(*) from public.bookings b left join public.trip_segments s on s.id=b.segment_id where b.segment_id is not null and (s.id is null or s.trip_id<>b.trip_id)) as invalid_booking_segments
)
select jsonb_pretty(jsonb_build_object(
 'report_version','pfew-phase7-admin-v1','read_only',current_setting('transaction_read_only'),
 'database',current_database(),'inspection_role',current_user,
 'migration_ledger',to_regclass('supabase_migrations.schema_migrations'),
 'columns',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.column_name) from columns c),
 'rpcs',(select jsonb_agg(to_jsonb(r) order by r.signature) from rpcs r),
 'relations',(select jsonb_agg(to_jsonb(r)-'oid' order by r.table_name) from relations r),
 'truncate_grants',(select jsonb_agg(to_jsonb(g) order by g.table_name,g.role_name) from dangerous_grants g where can_truncate),
 'constraints',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.conname) from constraints c),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname) from policies p),
 'triggers',(select jsonb_agg(to_jsonb(t) order by t.table_name,t.tgname) from triggers t),
 'booking_files_bucket',(select jsonb_agg(to_jsonb(b)) from bucket b),
 'trip_baseline',(select to_jsonb(t) from trip_baseline t),
 'booking_baseline',(select to_jsonb(b) from booking_baseline b),
 'attachment_baseline',(select to_jsonb(a) from attachment_baseline a),
 'broken_links',(select to_jsonb(b) from broken_links b)
)) as phase7_report;
commit;
-- If migration_ledger is NOT null, inspect history separately (not a migration):
-- begin transaction read only;
-- select version,to_jsonb(m)->>'name' as name from supabase_migrations.schema_migrations m order by version;
-- commit;
-- No ledger does not imply missing migrations. Compare actual catalogs instead.
