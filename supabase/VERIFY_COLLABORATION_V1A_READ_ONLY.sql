-- READ ONLY. Run the WHOLE file in the intended project's SQL Editor.
-- One result. No application RPCs are executed, and no personal rows or tokens
-- are exported. Keep policy expressions/permissions private.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';
with expected(table_name,column_name) as(values
 ('trips','creation_state'),('trips','draft_data'),('bookings','finance_revision'),('bookings','payment_due_date'),('booking_attachments','document_category'),('booking_attachments','document_revision'),('trips','trip_revision'),('trip_members','revoked_at'),('trip_members','member_revision'),('trip_invitations','revoked_at'),('trip_invitations','declined_at'),('booking_attachments','file_scope')
), columns as(
 select e.*,a.attnum is not null present,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_value
 from expected e left join pg_catalog.pg_attribute a on a.attrelid=to_regclass('public.'||e.table_name) and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
), functions as(
 select p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.proconfig settings,md5(p.prosrc) body_hash,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
 from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('has_other_private_files','managed_booking_editor_version','save_managed_booking','finalize_trip_draft','save_booking_intake','change_itinerary','change_packing','validate_private_upload','validate_trip_document','save_document_metadata','collaboration_version','can_read_trip','can_edit_trip','create_trip_invitation','preview_trip_invitation','accept_trip_invitation','decline_trip_invitation','respond_trip_invitation','list_my_trip_invitations','revoke_trip_invitation','manage_trip_member','save_shared_trip_details','trip_file_readable','trip_file_manageable','set_trip_file_scope','can_access_booking_file','shared_file_guard','shared_trip_revision_guard')
), policies as(
 select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_catalog.pg_policies
 where schemaname='public' or schemaname='storage' and tablename='objects'
), relations as(
 select c.relname,c.relrowsecurity rls_enabled,c.relforcerowsecurity rls_forced,pg_get_userbyid(c.relowner) owner,coalesce(c.relacl,acldefault('r',c.relowner)) privileges,
 has_table_privilege('anon',c.oid,'TRUNCATE') anon_truncate,has_table_privilege('authenticated',c.oid,'TRUNCATE') authenticated_truncate
 from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and c.relkind in('r','p')
), constraints as(
 select c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid,true) definition from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid where k.conrelid in(to_regclass('public.trips'),to_regclass('public.trip_members'),to_regclass('public.trip_invitations'),to_regclass('public.booking_attachments'))
), triggers as(
 select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal
), baseline as(
 select 'trips' table_name,count(*) count,md5(coalesce(string_agg(md5((to_jsonb(t)-'trip_revision')::text),'' order by id),'')) fingerprint from public.trips t
 union all select 'trip_members',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-array['revoked_at','member_revision'])::text),'' order by id),'')) from public.trip_members t
 union all select 'trip_invitations',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-array['revoked_at','declined_at'])::text),'' order by id),'')) from public.trip_invitations t
 union all select 'booking_attachments',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'file_scope')::text),'' order by id),'')) from public.booking_attachments t
), role_flags as(
 select rolname,rolsuper,rolbypassrls,rolinherit from pg_catalog.pg_roles where rolname in('anon','authenticated','service_role') or oid in(select proowner from pg_catalog.pg_proc where pronamespace='public'::regnamespace)
), default_privileges as(
 select pg_get_userbyid(d.defaclrole) owner,n.nspname schema_name,d.defaclobjtype,d.defaclacl privileges from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public' or d.defaclnamespace=0
), anomalies as(
 select (select count(*) from public.trip_members m join public.trips t on t.id=m.trip_id where t.creation_state='draft') draft_members,
 (select count(*) from public.trip_invitations i join public.trips t on t.id=i.trip_id where t.creation_state='draft') draft_invitations
)
select jsonb_pretty(jsonb_build_object('report_version','pfew-collaboration-v1a','read_only',current_setting('transaction_read_only'),
 'columns',(select jsonb_agg(to_jsonb(c)) from columns c),'functions',(select jsonb_agg(to_jsonb(f)) from functions f),
 'policies',(select jsonb_agg(to_jsonb(p)) from policies p),'relations',(select jsonb_agg(to_jsonb(r)) from relations r),
 'constraints',(select jsonb_agg(to_jsonb(c)) from constraints c),'triggers',(select jsonb_agg(to_jsonb(t)) from triggers t),
 'role_flags',(select jsonb_agg(to_jsonb(r)) from role_flags r),'default_privileges',(select jsonb_agg(to_jsonb(d)) from default_privileges d),'baseline',(select jsonb_agg(to_jsonb(b)) from baseline b),'anomalies',(select to_jsonb(a) from anomalies a),
 'booking_files_bucket',(select jsonb_build_object('public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) from storage.buckets where id='booking-files')
)) collaboration_report;
commit;
