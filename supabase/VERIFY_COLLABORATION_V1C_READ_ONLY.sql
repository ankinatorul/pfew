-- AUDIT ONLY. Run the WHOLE file in the intended Supabase SQL Editor.
-- Companion to VERIFY_COLLABORATION_V1A_READ_ONLY.sql, NOT a migration.
-- One result. No application RPCs, user rows, file paths or credentials returned.
-- Keep exports private: they contain schema/permission information.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';
with columns as (
 select c.relname as table_name,a.attname as column_name,
        format_type(a.atttypid,a.atttypmod) as column_type,a.attnotnull as not_null,
        pg_get_expr(d.adbin,d.adrelid) as default_value
 from pg_catalog.pg_class c
 join pg_catalog.pg_attribute a on a.attrelid=c.oid
 left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where c.relnamespace='public'::regnamespace and c.relkind in ('r','p')
   and a.attnum>0 and not a.attisdropped
), routines as (
 select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
        pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
        p.proconfig as settings,coalesce(p.proacl,acldefault('f',p.proowner)) as privileges,
        md5(p.prosrc) as body_hash,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
 from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace
   and p.prokind in ('f','p')
), indexes as (
 select t.relname as table_name,i.relname as index_name,x.indisvalid,x.indisready,
        pg_get_indexdef(i.oid) as definition
 from pg_catalog.pg_index x
 join pg_catalog.pg_class t on t.oid=x.indrelid
 join pg_catalog.pg_class i on i.oid=x.indexrelid
 where t.relnamespace='public'::regnamespace
), views as (
 select c.relname,c.relkind,c.reloptions,pg_get_userbyid(c.relowner) as owner,
        md5(pg_get_viewdef(c.oid,true)) as definition_hash
 from pg_catalog.pg_class c
 where c.relnamespace='public'::regnamespace and c.relkind in ('v','m')
), effective_permissions as (
 select c.relname as relation_name,r.role_name,
        has_table_privilege(r.role_name,c.oid,'SELECT') as can_select,
        has_table_privilege(r.role_name,c.oid,'INSERT') as can_insert,
        has_table_privilege(r.role_name,c.oid,'UPDATE') as can_update,
        has_table_privilege(r.role_name,c.oid,'DELETE') as can_delete,
        has_table_privilege(r.role_name,c.oid,'TRUNCATE') as can_truncate,
        has_any_column_privilege(r.role_name,c.oid,'INSERT') as any_column_insert,
        has_any_column_privilege(r.role_name,c.oid,'UPDATE') as any_column_update
 from pg_catalog.pg_class c cross join (values('anon'::text),('authenticated'::text)) r(role_name)
 where c.oid in (to_regclass('public.trip_members'),to_regclass('public.trip_invitations'),
                 to_regclass('storage.objects'),to_regclass('storage.buckets'))
), dependencies as (
 select pg_describe_object(d.classid,d.objid,d.objsubid) as dependent,
        pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) as referenced,d.deptype
 from pg_catalog.pg_depend d
 where (d.refclassid='pg_class'::regclass and d.refobjid in
          (to_regclass('public.trips'),to_regclass('public.trip_members'),
           to_regclass('public.trip_invitations'),to_regclass('public.booking_attachments')))
    or (d.refclassid='pg_proc'::regclass and d.refobjid in
          (to_regprocedure('public.can_read_trip(uuid)'),to_regprocedure('public.can_edit_trip(uuid)'),
           to_regprocedure('public.owns_trip(uuid)'),to_regprocedure('public.can_access_booking_file(text)')))
), storage_relations as (
 select c.relname,c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced,
        pg_get_userbyid(c.relowner) as owner,coalesce(c.relacl,acldefault('r',c.relowner)) as privileges
 from pg_catalog.pg_class c
 where c.oid in (to_regclass('storage.objects'),to_regclass('storage.buckets'))
), data_checks as (
 select (select count(*) from public.bookings) as booking_count,
        (select md5(coalesce(string_agg(md5(to_jsonb(b)::text),'' order by id),'')) from public.bookings b) as bookings_fingerprint,
        (select count(*) from public.bookings b left join public.trips t on t.id=b.trip_id where t.id is null) as orphan_bookings,
        (select count(*) from public.bookings b left join public.trip_segments s on s.id=b.segment_id where b.segment_id is not null and (s.id is null or s.trip_id<>b.trip_id)) as invalid_booking_segments,
        (select count(*) from public.trip_members where role='viewer') as legacy_viewer_memberships,
        (select count(*) from public.trip_invitations where role='viewer' and accepted_at is null and expires_at>now()) as unaccepted_unexpired_viewer_rows
)
select jsonb_pretty(jsonb_build_object(
 'report_version','pfew-collaboration-v1c','read_only',current_setting('transaction_read_only'),
 'database',current_database(),'inspection_role',current_user,
 'postgres_version',current_setting('server_version'),
 'migration_ledger',to_regclass('supabase_migrations.schema_migrations'),
 'columns',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.column_name) from columns c),
 'routines',(select jsonb_agg(to_jsonb(r) order by r.proname,r.arguments) from routines r),
 'indexes',(select jsonb_agg(to_jsonb(i) order by i.table_name,i.index_name) from indexes i),
 'views',(select jsonb_agg(to_jsonb(v) order by v.relname) from views v),
 'effective_permissions',(select jsonb_agg(to_jsonb(p) order by p.relation_name,p.role_name) from effective_permissions p),
 'dependencies',(select jsonb_agg(to_jsonb(d) order by d.referenced,d.dependent) from dependencies d),
 'storage_relations',(select jsonb_agg(to_jsonb(s) order by s.relname) from storage_relations s),
 'data_checks',(select to_jsonb(d) from data_checks d)
)) as collaboration_v1c_report;
commit;
-- If migration_ledger above is NOT null, run this separately (read-only):
-- begin transaction read only;
-- select version,to_jsonb(m)->>'name' as name
-- from supabase_migrations.schema_migrations m order by version;
-- commit;
-- Missing history is not proof of missing objects; SQL Editor changes may not be recorded.
-- pg_depend is not a complete dependency map for PL/pgSQL/dynamic SQL bodies.
-- Fingerprints are comparison aids, not proof that arbitrary function/view source is safe.
-- The viewer row count may include revoked/declined invitations after 019; it is
-- deliberately baseline-compatible and requires owner review, not automatic reissue.
