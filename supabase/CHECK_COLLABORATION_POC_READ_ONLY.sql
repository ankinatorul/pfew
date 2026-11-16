-- POC CHECK ONLY: paste this WHOLE file in a new Supabase SQL Editor query.
-- READ ONLY: one result, no user rows, application RPC calls or changes.
-- Exact body hashes are from the current local 018/019; differences need review.
-- "present" below means the checked installation matches, not a broad security audit.
begin transaction read only;
set local statement_timeout='15s';
with expected_functions(phase,signature,body_hash) as (values
 ('018','public.save_managed_booking(uuid,uuid,integer,jsonb)','6217a62c84105de7f3c97f9b6fbba144'),
 ('018','public.managed_booking_editor_version()','6ebceba1516d1b8c52d508dc3039fc26'),
 ('019','public.can_read_trip(uuid)','864022fabe53820151b2a0c41afeeca1'),
 ('019','public.can_edit_trip(uuid)','7a5bb5ae79deff13479f26753d2da310'),
 ('019','public.collaboration_version()','95adb6e77a0884d9e50232cb8c5c969d'),
 ('019','public.create_trip_invitation(uuid,text,text)','b62f61064895bdc93baa921ee6667128'),
 ('019','public.preview_trip_invitation(text)','1acfdb9b9ed5425c829bf71ca9a86593'),
 ('019','public.list_my_trip_invitations()','ef1a89902fc4d90dc5c8db61e596af68'),
 ('019','public.respond_trip_invitation(uuid,boolean)','3bd8d4850a17bc3d6e893e83301d5c4c'),
 ('019','public.accept_trip_invitation(text)','ce8726147ddb840c450287a10541af53'),
 ('019','public.decline_trip_invitation(text)','7111f62982fb62ef037e7643b16c2bea'),
 ('019','public.revoke_trip_invitation(uuid,uuid)','5e72c1077b368186da47f6ee91d06f9d'),
 ('019','public.manage_trip_member(uuid,uuid,integer,boolean)','d22d0bf65a39897dff94e50743844635'),
 ('019','public.shared_trip_revision_guard()','4fd90a8810b593eaa0efa23be03dc9ab'),
 ('019','public.save_shared_trip_details(uuid,integer,jsonb)','01fe60cb5416ff487bf7fe2b00cc4e0e'),
 ('019','public.trip_file_readable(uuid)','948dab0c6338a6abffc497c3106136b5'),
 ('019','public.trip_file_manageable(uuid)','ea3f23379bad2e0b1ed60da1178a6e38'),
 ('019','public.shared_file_guard()','d7b912c8bc63fac2aa4065d104ac02c5'),
 ('019','public.set_trip_file_scope(uuid,uuid,integer,text)','a6ad19e1bf60327cdd5d4f622bf0a251'),
 ('019','public.can_access_booking_file(text)','7662320e3568cf3090b27d7c2b9aba18'),
 ('019','public.has_other_private_files(uuid,uuid)','4c45dc79a3a6c2fb69924c39b4569012')
), functions as (
 select e.phase,e.signature,p.oid is not null as present,
        md5(p.prosrc)=e.body_hash as body_matches,
        pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
        pg_get_function_result(p.oid) as returns,p.proconfig as settings,
        case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,
        case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute
 from expected_functions e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), needed018(table_name,column_name) as (
 select 'trips','creation_state' union all
 select 'bookings',unnest(string_to_array('id trip_id title category provider reference start_date end_date local_time timezone end_local_time end_timezone origin destination travelers notes price paid_amount currency payment_status verification reservation_status segment_id location_id location_label latitude longitude end_location_id end_location_label end_latitude end_longitude payment_due_date finance_revision',' '))
), new019(table_name,column_name) as (values
 ('trips','trip_revision'),
 ('trip_members','revoked_at'),
 ('trip_members','member_revision'),
 ('trip_invitations','revoked_at'),
 ('trip_invitations','declined_at'),
 ('booking_attachments','file_scope')
), expected_policies(schema_name,table_name,policy_name) as (values
 ('public','trips','trip_update'),
 ('public','trips','collaboration_trip_read_boundary'),
 ('public','trips','collaboration_trip_insert_boundary'),
 ('public','trips','collaboration_trip_update_boundary'),
 ('public','trips','collaboration_trip_delete_boundary'),
 ('public','booking_attachments','collaboration_file_read'),
 ('public','booking_attachments','collaboration_owner_shared_delete'),
 ('public','booking_attachments','collaboration_file_read_boundary'),
 ('public','booking_attachments','collaboration_file_update_boundary'),
 ('public','booking_attachments','collaboration_file_delete_boundary'),
 ('storage','objects','pfew_booking_files_insert'),
 ('storage','objects','pfew_booking_files_delete'),
 ('storage','objects','collaboration_storage_read_boundary'),
 ('storage','objects','collaboration_storage_insert_boundary'),
 ('storage','objects','collaboration_storage_delete_boundary'),
 ('storage','objects','collaboration_storage_no_overwrite'),
 ('storage','objects','collaboration_storage_no_anon'),
 ('public','booking_attachments','collaboration_file_no_anon'),
 ('public','trips','collaboration_trip_no_anon')
), missing_policies as (
 select e.* from expected_policies e left join pg_catalog.pg_policies p
 on p.schemaname=e.schema_name and p.tablename=e.table_name and p.policyname=e.policy_name where p.policyname is null
), new_column_state as (
 select e.*,a.attnum is not null as present,format_type(a.atttypid,a.atttypmod) as column_type,
 a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as default_value
 from new019 e left join pg_catalog.pg_attribute a on a.attrelid=to_regclass('public.'||e.table_name)
 and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
), missing018 as (
 select e.* from needed018 e where not exists(select 1 from pg_catalog.pg_attribute a
 where a.attrelid=to_regclass('public.'||e.table_name) and a.attname=e.column_name and a.attnum>0 and not a.attisdropped)
), triggers as (
 select c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition
 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
 where t.tgrelid in (to_regclass('public.trips'),to_regclass('public.booking_attachments'))
 and t.tgname in ('shared_trip_revision','shared_file_scope') and not t.tgisinternal
), signals as (
 select (select count(*) from new_column_state where present)
 + (select count(*) from pg_catalog.pg_policies where policyname like 'collaboration_%' and schemaname in ('public','storage'))
 + (select count(*) from triggers)
 + (select count(*) from functions where phase='019' and (body_matches or (present and signature ~ '(collaboration_version|create_trip_invitation|decline_trip_invitation|respond_trip_invitation|list_my_trip_invitations|revoke_trip_invitation|manage_trip_member|shared_trip_revision_guard|save_shared_trip_details|trip_file_readable|trip_file_manageable|shared_file_guard|set_trip_file_scope)\(')))
 + case when to_regclass('public.trip_invitations_recipient') is null then 0 else 1 end
 + (select count(*) from pg_catalog.pg_constraint where conrelid=to_regclass('public.booking_attachments') and conname='personal_identity_stays_private') as count
)
select jsonb_pretty(jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'migration018_functions',(select jsonb_agg(to_jsonb(f)) from functions f where phase='018'),
 'migration018_missing_columns',coalesce((select jsonb_agg(to_jsonb(m)) from missing018 m),'[]'::jsonb),
 'migration019_signals',case when (select count from signals)=0 then 'absent: no checked 019 installation signals' else 'present or partial: review the details below; do not replay 019' end,
 'migration019_functions',(select jsonb_agg(to_jsonb(f)) from functions f where phase='019'),
 'migration019_columns',(select jsonb_agg(to_jsonb(c)) from new_column_state c),
 'migration019_missing_policies',coalesce((select jsonb_agg(to_jsonb(p)) from missing_policies p),'[]'::jsonb),
 'migration019_triggers',(select jsonb_agg(to_jsonb(t)) from triggers t),
 'identity_constraint',(select pg_get_constraintdef(k.oid,true) from pg_catalog.pg_constraint k where k.conrelid=to_regclass('public.booking_attachments') and k.conname='personal_identity_stays_private'),
 'rls',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'enabled',c.relrowsecurity)) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where c.oid in (to_regclass('public.trips'),to_regclass('public.trip_members'),to_regclass('public.trip_invitations'),to_regclass('public.booking_attachments'),to_regclass('storage.objects'))),
 'bucket_private',(select not public from storage.buckets where id='booking-files'),
 'member_invitation_direct_writes',(select jsonb_agg(jsonb_build_object('table',c.relname,'insert',has_any_column_privilege('authenticated',c.oid,'INSERT'),'update',has_any_column_privilege('authenticated',c.oid,'UPDATE'),'delete',has_table_privilege('authenticated',c.oid,'DELETE'))) from pg_catalog.pg_class c where c.oid in (to_regclass('public.trip_members'),to_regclass('public.trip_invitations')))
)) as collaboration_poc_check;
commit;
