-- COPY THIS WHOLE FILE into Supabase SQL Editor and run it once.
-- READ ONLY. Does NOT apply migration 010 or change any records/settings.
-- Returns ONE row called pfew_readiness_report. Export that row as CSV.
-- Contains metadata, counts and fingerprints, not personal trip/booking rows.
-- Full function/view code is replaced by fingerprints to avoid exporting
-- secrets that could have been hardcoded in custom routines/views.
-- Policy/constraint expressions are included: keep the report private.
-- A migration ledger's presence is checked; its entries may require one follow-up.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '2s';

with
database as (
select current_database() as database_name, current_user as inspection_role,
       current_setting('server_version') as postgres_version,
       current_setting('transaction_read_only') as read_only,
       to_regclass('supabase_migrations.schema_migrations') as migration_ledger
),
tables_and_permissions as (
select n.nspname as schema_name, c.relname as relation_name, c.relkind,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       coalesce(c.relacl, acldefault('r',c.relowner)) as privileges
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')
   or n.nspname='storage' and c.relname in ('objects','buckets')
order by n.nspname,c.relname
),
columns as (
select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,
       format_type(a.atttypid,a.atttypmod) as column_type,
       a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as column_default
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid=a.attrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m')
  and (n.nspname='public' or n.nspname='storage' and c.relname in ('objects','buckets'))
order by n.nspname,c.relname,a.attnum
),
constraints as (
select n.nspname as schema_name,c.relname as table_name,k.conname,k.contype,
       k.convalidated,pg_get_constraintdef(k.oid,true) as definition
from pg_catalog.pg_constraint k
join pg_catalog.pg_class c on c.oid=k.conrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
   or n.nspname='storage' and c.relname in ('objects','buckets')
   or k.confrelid in (to_regclass('public.trips'),to_regclass('public.bookings'))
order by n.nspname,c.relname,k.conname
),
indexes as (
select n.nspname as schema_name,c.relname as table_name,i.relname as index_name,
       x.indisvalid,x.indisready,pg_get_indexdef(i.oid) as definition
from pg_catalog.pg_index x
join pg_catalog.pg_class c on c.oid=x.indrelid
join pg_catalog.pg_class i on i.oid=x.indexrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' or n.nspname='storage' and c.relname in ('objects','buckets')
order by n.nspname,c.relname,i.relname
),
triggers as (
select n.nspname as schema_name,c.relname as table_name,t.tgname,t.tgenabled,
       pg_get_triggerdef(t.oid,true) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid=t.tgrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal
  and (n.nspname='public' or n.nspname='storage' and c.relname in ('objects','buckets'))
order by n.nspname,c.relname,t.tgname
),
functions as (
select n.nspname as schema_name,p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
       p.provolatile,p.proconfig,
       coalesce(p.proacl,acldefault('f',p.proowner)) as privileges,
       md5(pg_get_functiondef(p.oid)) as definition_hash,
       md5(p.prosrc) as body_hash
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p')
order by p.proname,pg_get_function_identity_arguments(p.oid)
),
rls_policies as (
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_catalog.pg_policies
where schemaname='public' or schemaname='storage' and tablename in ('objects','buckets')
order by schemaname,tablename,policyname
),
views as (
select n.nspname as schema_name,c.relname as view_name,c.relkind,c.reloptions,
       pg_get_userbyid(c.relowner) as owner,md5(pg_get_viewdef(c.oid,true)) as definition_hash
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m') order by c.relname
),
roles as (
select rolname,rolsuper,rolbypassrls,rolinherit
from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role')
),
default_permissions as (
select pg_get_userbyid(d.defaclrole) as owner,n.nspname as schema_name,
       d.defaclobjtype,d.defaclacl
from pg_catalog.pg_default_acl d
left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or d.defaclnamespace=0
),
trip_baseline as (
select 'trips' as table_name,count(*) as record_count,
       count(*) filter(where start_date is null) as missing_start,
       count(*) filter(where end_date is null) as missing_end,
       count(*) filter(where end_date<start_date) as reversed_dates,
       md5(coalesce(string_agg(md5((to_jsonb(t)-array[
         'creation_state','draft_data','draft_step','draft_revision'
       ])::text),'' order by id),'')) as original_fields_fingerprint
from public.trips t
),
booking_baseline as (
select 'bookings' as table_name,count(*) as record_count,
       count(*) filter(where start_date is null) as missing_start,
       count(*) filter(where end_date is null) as missing_end,
       count(*) filter(where end_date<start_date) as reversed_dates,
       md5(coalesce(string_agg(md5(to_jsonb(b)::text),'' order by id),''))
         as original_fields_fingerprint
from public.bookings b
),
bookings_without_trip as (
select count(*) as bookings_without_trip
from public.bookings b left join public.trips t on t.id=b.trip_id
where t.id is null
),
invalid_booking_links as (
select count(*) as bookings_with_invalid_segment_link
from public.bookings b left join public.trip_segments s on s.id=b.segment_id
where b.segment_id is not null and (s.id is null or s.trip_id<>b.trip_id)
)
select jsonb_pretty(jsonb_build_object(
  'report_version','pfew-010-single-result-v1',
  'function_and_view_sources','Fingerprints only; source inspection may require a targeted follow-up.',
  'migration_history','Ledger presence is included in database; history entries are not exported.',
  'database',coalesce((select jsonb_agg(to_jsonb(result)) from database result),'[]'::jsonb),
  'tables_and_permissions',coalesce((select jsonb_agg(to_jsonb(result)) from tables_and_permissions result),'[]'::jsonb),
  'columns',coalesce((select jsonb_agg(to_jsonb(result)) from columns result),'[]'::jsonb),
  'constraints',coalesce((select jsonb_agg(to_jsonb(result)) from constraints result),'[]'::jsonb),
  'indexes',coalesce((select jsonb_agg(to_jsonb(result)) from indexes result),'[]'::jsonb),
  'triggers',coalesce((select jsonb_agg(to_jsonb(result)) from triggers result),'[]'::jsonb),
  'functions',coalesce((select jsonb_agg(to_jsonb(result)) from functions result),'[]'::jsonb),
  'rls_policies',coalesce((select jsonb_agg(to_jsonb(result)) from rls_policies result),'[]'::jsonb),
  'views',coalesce((select jsonb_agg(to_jsonb(result)) from views result),'[]'::jsonb),
  'roles',coalesce((select jsonb_agg(to_jsonb(result)) from roles result),'[]'::jsonb),
  'default_permissions',coalesce((select jsonb_agg(to_jsonb(result)) from default_permissions result),'[]'::jsonb),
  'trip_baseline',coalesce((select jsonb_agg(to_jsonb(result)) from trip_baseline result),'[]'::jsonb),
  'booking_baseline',coalesce((select jsonb_agg(to_jsonb(result)) from booking_baseline result),'[]'::jsonb),
  'bookings_without_trip',coalesce((select jsonb_agg(to_jsonb(result)) from bookings_without_trip result),'[]'::jsonb),
  'invalid_booking_links',coalesce((select jsonb_agg(to_jsonb(result)) from invalid_booking_links result),'[]'::jsonb)
)) as pfew_readiness_report;

commit;
