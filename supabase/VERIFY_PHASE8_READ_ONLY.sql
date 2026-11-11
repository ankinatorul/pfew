-- Optional administrator inspection before/after reviewed migration 014.
-- READ ONLY. Does not call application RPCs, apply updates or select user rows.
-- One result. Keep the export private; it contains schema metadata and hashes.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';
with expected_columns(table_name,column_name) as (values
 ('trip_segments','itinerary_revision'),('trip_segments','activity_category'),
 ('trip_segments','completed_at'),('trip_segments','destination_location_id'),
 ('ai_suggestions','context'),('service_usage','itinerary_request_id')
), columns as (
 select e.*,a.attnum is not null as present,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as default_value
 from expected_columns e left join pg_catalog.pg_attribute a on a.attrelid=to_regclass('public.'||e.table_name) and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
), signatures(signature) as (values
 ('public.change_itinerary(uuid,jsonb)'),('public.reserve_itinerary_ideas(uuid,uuid)'),
 ('public.persist_itinerary_ideas(uuid,uuid,uuid,jsonb,jsonb)'),('public.itinerary_revision_guard()')
), routines as (
 select s.signature,p.oid is not null as present,pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,p.proconfig as settings,md5(p.prosrc) as body_hash,
 case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,
 case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute
 from signatures s left join pg_catalog.pg_proc p on p.oid=to_regprocedure(s.signature)
), relations as (
 select c.relname as table_name,c.relrowsecurity as rls_enabled from pg_catalog.pg_class c where c.oid in (to_regclass('public.trips'),to_regclass('public.trip_segments'),to_regclass('public.bookings'),to_regclass('public.ai_suggestions'),to_regclass('public.service_usage'))
), triggers as (
 select t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition from pg_catalog.pg_trigger t where t.tgrelid=to_regclass('public.trip_segments') and not t.tgisinternal
), indexes as (
 select i.relname as name,x.indisvalid,x.indisready,pg_get_indexdef(i.oid) as definition from pg_catalog.pg_index x join pg_catalog.pg_class i on i.oid=x.indexrelid where i.relname='itinerary_service_request' and i.relnamespace='public'::regnamespace
), baselines as (
 select 'trip_segments' as table_name,count(*) as count,md5(coalesce(string_agg(md5((to_jsonb(s)-array['itinerary_revision','activity_category','completed_at','destination_location_id'])::text),'' order by id),'')) as original_fields_fingerprint from public.trip_segments s
 union all select 'bookings',count(*),md5(coalesce(string_agg(md5(to_jsonb(b)::text),'' order by id),'')) from public.bookings b
 union all select 'ai_suggestions',count(*),md5(coalesce(string_agg(md5((to_jsonb(a)-'context')::text),'' order by id),'')) from public.ai_suggestions a
), broken_booking_links as (
 select count(*) as count from public.bookings b left join public.trip_segments s on s.id=b.segment_id where b.segment_id is not null and (s.id is null or s.trip_id<>b.trip_id)
)
select jsonb_pretty(jsonb_build_object(
 'report_version','pfew-phase8-v1','read_only',current_setting('transaction_read_only'),
 'columns',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.column_name) from columns c),
 'routines',(select jsonb_agg(to_jsonb(r) order by r.signature) from routines r),
 'relations',(select jsonb_agg(to_jsonb(r) order by r.table_name) from relations r),
 'triggers',(select jsonb_agg(to_jsonb(t) order by t.tgname) from triggers t),
 'indexes',(select jsonb_agg(to_jsonb(i)) from indexes i),
 'baselines',(select jsonb_agg(to_jsonb(b) order by b.table_name) from baselines b),
 'broken_booking_links',(select to_jsonb(b) from broken_booking_links b)
)) as phase8_report;
commit;
