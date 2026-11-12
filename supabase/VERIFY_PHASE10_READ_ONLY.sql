-- Optional administrator inspection before/after reviewed 016. READ ONLY.
-- One result, catalog metadata and aggregate fingerprints; no personal rows.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';
with expected_columns(table_name,column_name) as (values
 ('packing_items','notes'),('packing_items','position'),('packing_items','packing_revision'),('packing_lists','packing_revision'),('prep_tasks','readiness_revision'),
 ('booking_attachments','document_kind'),('booking_attachments','display_name'),('booking_attachments','document_category'),('booking_attachments','documents_hidden'),('booking_attachments','document_revision')
), columns as (
 select e.*,a.attnum is not null as present,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as default_value from expected_columns e left join pg_catalog.pg_attribute a on a.attrelid=to_regclass('public.'||e.table_name) and a.attname=e.column_name and a.attnum>0 and not a.attisdropped left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
), signatures(signature) as (values
 ('public.document_identity_guard()'),('public.validate_trip_document()'),('public.save_document_metadata(uuid,uuid,integer,text,text,boolean)'),('public.packing_revision_guard()'),('public.preparation_revision_guard()'),('public.change_packing(uuid,jsonb)'),('public.change_preparation_reminder(uuid,jsonb,boolean)'),('public.validate_private_upload()')
), routines as (
 select s.signature,p.oid is not null as present,pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,p.proconfig as settings,md5(p.prosrc) as body_hash,case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute from signatures s left join pg_catalog.pg_proc p on p.oid=to_regprocedure(s.signature)
), relations as (
 select c.relname as table_name,c.relrowsecurity as rls_enabled from pg_catalog.pg_class c where c.oid in (to_regclass('public.packing_items'),to_regclass('public.packing_lists'),to_regclass('public.prep_tasks'),to_regclass('public.booking_attachments'))
), triggers as (
 select c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid where t.tgrelid in (to_regclass('public.packing_items'),to_regclass('public.packing_lists'),to_regclass('public.prep_tasks'),to_regclass('public.booking_attachments')) and not t.tgisinternal
), constraints as (
 select c.relname as table_name,k.conname,k.convalidated,pg_get_constraintdef(k.oid,true) as definition from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid where k.conrelid=to_regclass('public.booking_attachments')
), policies as (
 select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_catalog.pg_policies where schemaname='public' and tablename in ('packing_items','packing_lists','prep_tasks','booking_attachments') or schemaname='storage' and tablename='objects' and policyname like 'pfew_booking_files%'
), bucket as (
 select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='booking-files'
), baselines as (
 select 'packing_items' as table_name,count(*) as count,md5(coalesce(string_agg(md5((to_jsonb(i)-array['notes','position','packing_revision'])::text),'' order by id),'')) as original_fields_fingerprint from public.packing_items i
 union all select 'packing_lists',count(*),md5(coalesce(string_agg(md5((to_jsonb(l)-'packing_revision')::text),'' order by id),'')) from public.packing_lists l
 union all select 'prep_tasks',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'readiness_revision')::text),'' order by id),'')) from public.prep_tasks t
 union all select 'booking_attachments',count(*),md5(coalesce(string_agg(md5((to_jsonb(a)-array['document_kind','display_name','document_category','documents_hidden','document_revision'])::text),'' order by id),'')) from public.booking_attachments a
)
select jsonb_pretty(jsonb_build_object('report_version','pfew-phase10-v1','read_only',current_setting('transaction_read_only'),
 'columns',(select jsonb_agg(to_jsonb(c) order by c.table_name,c.column_name) from columns c),
 'routines',(select jsonb_agg(to_jsonb(r) order by r.signature) from routines r),
 'relations',(select jsonb_agg(to_jsonb(r) order by r.table_name) from relations r),
 'triggers',(select jsonb_agg(to_jsonb(t) order by t.table_name,t.tgname) from triggers t),
 'constraints',(select jsonb_agg(to_jsonb(c) order by c.conname) from constraints c),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname) from policies p),
 'bucket',(select jsonb_agg(to_jsonb(b)) from bucket b),
 'baselines',(select jsonb_agg(to_jsonb(b) order by b.table_name) from baselines b)
)) as phase10_report;
commit;
