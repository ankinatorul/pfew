-- Copy this whole file into a NEW Supabase SQL Editor query and run once.
-- READ ONLY: does not apply 010, run these functions, or modify records.
-- Returns ONE report. Export it as CSV, as before.
-- This targeted follow-up includes the source of FIVE database functions.
-- Keep the export private. If custom source contains credentials, do not share
-- those values; report that a definition needs redaction instead.
-- It returns only counts and preference KEY NAMES for the old onboarding table,
-- not stored preference values, trip IDs, account IDs, or booking contents.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '2s';

with routines as (
 select p.proname,
        pg_get_function_identity_arguments(p.oid) as identity_arguments,
        pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
        p.proconfig,coalesce(p.proacl,acldefault('f',p.proowner)) as privileges,
        pg_get_functiondef(p.oid) as definition
 from pg_catalog.pg_proc p
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
   and p.proname in (
     'valid_time_zone','validate_destination_link',
     'create_onboarding_trip','complete_onboarding_draft','reserve_onboarding_ai'
   )
 order by p.proname,pg_get_function_identity_arguments(p.oid)
), onboarding_counts as (
 select count(*) as onboarding_records,
        count(*) filter(where t.id is null) as missing_trip_links,
        count(*) filter(where t.owner_id is distinct from o.owner_id)
          as mismatched_trip_owners
 from public.trip_onboarding o left join public.trips t on t.id=o.trip_id
), preference_keys as (
 select distinct key_name
 from public.trip_onboarding o
 cross join lateral jsonb_object_keys(o.preferences) as keys(key_name)
)
select jsonb_pretty(jsonb_build_object(
 'report_version','pfew-010-targeted-followup-v1',
 'read_only',current_setting('transaction_read_only'),
 'functions',coalesce((select jsonb_agg(to_jsonb(r)) from routines r),'[]'::jsonb),
 'old_onboarding_counts',(select to_jsonb(c) from onboarding_counts c),
 'old_onboarding_preference_key_names',coalesce(
   (select jsonb_agg(key_name order by key_name) from preference_keys),'[]'::jsonb
 )
)) as pfew_followup_report;

commit;
