-- READ-ONLY catalog inspection. This is NOT a migration.
-- Run only against the intended development project, then export each result.
-- No trip, booking, account, token, filename, or document rows are selected.
-- Keep exports private: custom function/view definitions may contain secrets.
begin transaction read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

-- Identify the database/role and discover whether a migration ledger exists.
select current_database() as database_name, current_user as inspection_role,
       current_setting('server_version') as postgres_version,
       current_setting('transaction_read_only') as read_only,
       to_regclass('supabase_migrations.schema_migrations') as migration_ledger;

-- Tables, owners, RLS flags, and effective relation ACLs.
select n.nspname as schema_name, c.relname as relation_name, c.relkind,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       coalesce(c.relacl, acldefault('r',c.relowner)) as privileges
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')
   or n.nspname='storage' and c.relname in ('objects','buckets')
order by n.nspname,c.relname;

-- Exact types, nullability, and defaults; includes pre-existing partial 010 columns.
select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,
       format_type(a.atttypid,a.atttypmod) as column_type,
       a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as column_default
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid=a.attrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m')
  and (n.nspname='public' or n.nspname='storage' and c.relname in ('objects','buckets'))
order by n.nspname,c.relname,a.attnum;

-- Constraints and incoming foreign keys, including references from other schemas.
select n.nspname as schema_name,c.relname as table_name,k.conname,k.contype,
       k.convalidated,pg_get_constraintdef(k.oid,true) as definition
from pg_catalog.pg_constraint k
join pg_catalog.pg_class c on c.oid=k.conrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
   or n.nspname='storage' and c.relname in ('objects','buckets')
   or k.confrelid in (to_regclass('public.trips'),to_regclass('public.bookings'))
order by n.nspname,c.relname,k.conname;

-- Index definitions and validity/readiness, not just index names.
select n.nspname as schema_name,c.relname as table_name,i.relname as index_name,
       x.indisvalid,x.indisready,pg_get_indexdef(i.oid) as definition
from pg_catalog.pg_index x
join pg_catalog.pg_class c on c.oid=x.indrelid
join pg_catalog.pg_class i on i.oid=x.indexrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' or n.nspname='storage' and c.relname in ('objects','buckets')
order by n.nspname,c.relname,i.relname;

-- All custom triggers, including disabled and unexpected live additions.
select n.nspname as schema_name,c.relname as table_name,t.tgname,t.tgenabled,
       pg_get_triggerdef(t.oid,true) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid=t.tgrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal
  and (n.nspname='public' or n.nspname='storage' and c.relname in ('objects','buckets'))
order by n.nspname,c.relname,t.tgname;

-- Function signatures, ownership, security mode, search_path, grants and source.
-- Actual ACLs must be reviewed: CREATE OR REPLACE preserves existing grants/owner.
select n.nspname as schema_name,p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
       p.provolatile,p.proconfig,
       coalesce(p.proacl,acldefault('f',p.proowner)) as privileges,
       pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p')
order by p.proname,pg_get_function_identity_arguments(p.oid);

-- Inspect every policy, including extra permissive policies combined with OR.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_catalog.pg_policies
where schemaname='public' or schemaname='storage' and tablename in ('objects','buckets')
order by schemaname,tablename,policyname;

-- Views may contain unfiltered trip queries or run with an owner's privileges.
select n.nspname as schema_name,c.relname as view_name,c.relkind,c.reloptions,
       pg_get_userbyid(c.relowner) as owner,pg_get_viewdef(c.oid,true) as definition
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m') order by c.relname;

select rolname,rolsuper,rolbypassrls,rolinherit
from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role');

-- Definitions of future-object defaults affect function and table grants.
select pg_get_userbyid(d.defaclrole) as owner,n.nspname as schema_name,
       d.defaclobjtype,d.defaclacl
from pg_catalog.pg_default_acl d
left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or d.defaclnamespace=0;

commit;

-- Only if the first result confirms the migration ledger exists, run this
-- separately in a read-only transaction and export the history (not SQL bodies):
-- begin transaction read only;
-- select version,name from supabase_migrations.schema_migrations order by version;
-- commit;
-- A missing ledger does not prove missing migrations: SQL Editor setups can
-- have no CLI history. Compare the actual object definitions above instead.
