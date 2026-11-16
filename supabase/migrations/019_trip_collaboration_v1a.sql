-- PREPARED ONLY. Review 001–018, live policies/grants and recovery first.
-- No legacy trip/member/invitation/file rows are reclassified or deleted.
-- V1B reuses this unapplied migration; preview includes recipient-safe states.
begin;
do $$begin
 if exists(select 1 from pg_catalog.pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then raise exception 'End-user roles must enforce RLS; administrator review required';end if;
end $$;
alter table public.trip_members add column if not exists revoked_at timestamptz;
alter table public.trip_members add column if not exists member_revision integer not null default 0 check(member_revision>=0);
alter table public.trip_invitations add column if not exists revoked_at timestamptz;
alter table public.trip_invitations add column if not exists declined_at timestamptz;
alter table public.trips add column if not exists trip_revision integer not null default 0 check(trip_revision>=0);
alter table public.booking_attachments add column if not exists file_scope text not null default 'private' check(file_scope in ('private','shared'));
alter table public.booking_attachments add constraint personal_identity_stays_private check(file_scope='private' or document_category<>'Passport & ID');
create index if not exists trip_invitations_recipient on public.trip_invitations(lower(email),expires_at) where accepted_at is null and revoked_at is null and declined_at is null;

create or replace function public.can_read_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t where t.id=target and (t.owner_id=auth.uid() or (t.creation_state='finalized' and exists(select 1 from public.trip_members m where m.trip_id=t.id and m.user_id=auth.uid() and m.revoked_at is null))))
$$;
create or replace function public.can_edit_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t where t.id=target and (t.owner_id=auth.uid() or (t.creation_state='finalized' and exists(select 1 from public.trip_members m where m.trip_id=t.id and m.user_id=auth.uid() and m.role='editor' and m.revoked_at is null))))
$$;
-- Explicit RPC-only membership/invitation mutation; existing owner/self SELECT
-- policies remain, and cannot turn a token hash into a membership directly.
revoke insert,update,delete,truncate on public.trip_members,public.trip_invitations from public,anon,authenticated;
grant select on public.trip_members,public.trip_invitations to authenticated;
create or replace function public.collaboration_version() returns integer language sql stable security invoker set search_path='' as $$select 1$$;
create or replace function public.create_trip_invitation(target uuid,recipient text,invite_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare ident uuid;begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 perform 1 from public.trips where id=target and owner_id=auth.uid() and creation_state='finalized' for update;
 if not found then raise exception 'Only owners of finalized trips can invite';end if;
 recipient=lower(btrim(recipient));
 if recipient is null or length(recipient) not between 3 and 254 or recipient!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or invite_hash is null or invite_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid invitation';end if;
 if exists(select 1 from auth.users where id=auth.uid() and lower(email)=recipient) then raise exception 'The owner already has access';end if;
 -- Only disclose existing access within this owner's trip, never general accounts.
 if exists(select 1 from public.trip_members m join auth.users u on u.id=m.user_id where m.trip_id=target and m.revoked_at is null and lower(u.email)=recipient) then raise exception 'Recipient already has trip access';end if;
 if exists(select 1 from public.trip_invitations where trip_id=target and lower(email)=recipient and accepted_at is null and revoked_at is null and declined_at is null and expires_at>now()) then raise exception 'An invitation is already pending. Revoke it before creating another';end if;
 insert into public.trip_invitations(trip_id,email,role,token_hash,expires_at) values(target,recipient,'editor',invite_hash,now()+interval '7 days') returning id into ident;
 return ident;
end $$;
create or replace function public.preview_trip_invitation(invite_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.trip_invitations;t public.trips;account_email text;begin
 select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if account_email is null then return null;end if;
 select * into i from public.trip_invitations where token_hash=invite_hash;
 if not found then return null;end if;
 if lower(i.email)<>account_email then return null;end if;
 -- Status detail belongs only to the verified intended recipient. Null remains
 -- indistinguishable for invalid links and other accounts; no account enumeration.
 if i.revoked_at is not null then return jsonb_build_object('state','revoked');end if;
 if i.declined_at is not null then return jsonb_build_object('state','declined');end if;
 if i.expires_at<=now() then return jsonb_build_object('state','expired');end if;
 select * into t from public.trips where id=i.trip_id and creation_state='finalized';
 if not found or i.role<>'editor' then return null;end if;
 if i.accepted_at is not null then
  if i.accepted_by<>auth.uid() or not public.can_read_trip(t.id) then return jsonb_build_object('state','revoked');end if;
  return jsonb_build_object('state','accepted','trip_name',t.name,'trip_id',t.id,'role',i.role,'accepted',true,'expires_at',i.expires_at);
 end if;
 return jsonb_build_object('state','valid','trip_name',t.name,'role',i.role,'accepted',false,'expires_at',i.expires_at);
end $$;
create or replace function public.list_my_trip_invitations() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'trip_name',t.name,'role',i.role,'expires_at',i.expires_at) order by i.created_at),'[]'::jsonb)
 from public.trip_invitations i join public.trips t on t.id=i.trip_id join auth.users u on u.id=auth.uid()
 where u.email_confirmed_at is not null and lower(i.email)=lower(u.email) and i.accepted_at is null and i.revoked_at is null and i.declined_at is null and i.expires_at>now() and i.role='editor' and t.creation_state='finalized'
$$;
-- All access mutations lock the same parent before invitation/member rows.
-- This orders accept/revoke/remove races and prevents a revoked link restoring access.
create or replace function public.respond_trip_invitation(invitation_id uuid,accept boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.trip_invitations;target uuid;account_email text;begin
 select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if account_email is null then raise exception 'Verified account required';end if;
 select trip_id into target from public.trip_invitations where id=invitation_id and lower(email)=account_email;
 if target is null then raise exception 'Invitation unavailable or expired';end if;
 perform 1 from public.trips where id=target and creation_state='finalized' for update;
 if not found then raise exception 'Invitation unavailable or expired';end if;
 select * into i from public.trip_invitations where id=invitation_id and lower(email)=account_email for update;
 if not found or i.revoked_at is not null or i.declined_at is not null or i.expires_at<=now() or i.role<>'editor' or accept is null then raise exception 'Invitation unavailable or expired';end if;
 if i.accepted_at is not null then
  if accept and i.accepted_by=auth.uid() and public.can_read_trip(target) then return target;end if;
  raise exception 'Invitation already used or access removed';
 end if;
 if not accept then update public.trip_invitations set declined_at=now() where id=i.id;return null;end if;
 if not public.owns_trip(target) then
  insert into public.trip_members(trip_id,user_id,role) values(target,auth.uid(),'editor')
  on conflict(trip_id,user_id) do update set role='editor',revoked_at=null,member_revision=public.trip_members.member_revision+1;
 end if;
 update public.trip_invitations set accepted_at=now(),accepted_by=auth.uid() where id=i.id;
 return target;
end $$;
create or replace function public.accept_trip_invitation(invite_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare ident uuid;begin
 select i.id into ident from public.trip_invitations i join auth.users u on u.id=auth.uid() where i.token_hash=invite_hash and lower(i.email)=lower(u.email) and u.email_confirmed_at is not null;
 if ident is null then raise exception 'Invitation unavailable or expired';end if;
 return public.respond_trip_invitation(ident,true);
end $$;
create or replace function public.decline_trip_invitation(invite_hash text) returns void language plpgsql security definer set search_path='' as $$
declare ident uuid;begin
 select i.id into ident from public.trip_invitations i join auth.users u on u.id=auth.uid() where i.token_hash=invite_hash and lower(i.email)=lower(u.email) and u.email_confirmed_at is not null;
 if ident is null then raise exception 'Invitation unavailable or expired';end if;
 perform public.respond_trip_invitation(ident,false);
end $$;
create or replace function public.revoke_trip_invitation(target uuid,invitation_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.trips where id=target and owner_id=auth.uid() and creation_state='finalized' for update;
 if not found then raise exception 'Only the owner can manage invitations';end if;
 update public.trip_invitations set revoked_at=coalesce(revoked_at,now()) where id=invitation_id and trip_id=target;
 if not found then raise exception 'Invitation unavailable';end if;
end $$;
create or replace function public.manage_trip_member(target uuid,member uuid,expected_revision integer,remove boolean) returns void language plpgsql security definer set search_path='' as $$
declare m public.trip_members;begin
 perform 1 from public.trips where id=target and owner_id=auth.uid() and creation_state='finalized' for update;
 if not found then raise exception 'Only the owner can manage collaborators';end if;
 select * into m from public.trip_members where id=member and trip_id=target for update;
 if not found or m.user_id=auth.uid() or remove is null then raise exception 'Collaborator unavailable';end if;
 if m.member_revision is distinct from expected_revision then raise exception 'Membership changed. Reload before saving';end if;
 update public.trip_members set revoked_at=case when remove then coalesce(revoked_at,now()) else revoked_at end,role=case when remove then role else 'editor' end,member_revision=member_revision+1 where id=m.id;
 if remove then update public.trip_invitations i set revoked_at=coalesce(i.revoked_at,now()) where i.trip_id=target and (i.accepted_by=m.user_id or lower(i.email)=(select lower(email) from auth.users where id=m.user_id));end if;
end $$;

-- Editors can change trip details, never ownership/publication/internal draft data.
create or replace function public.shared_trip_revision_guard() returns trigger language plpgsql set search_path='' as $$begin
 if auth.uid() is not null and auth.uid()<>old.owner_id and
 (to_jsonb(new)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision']) is distinct from
 (to_jsonb(old)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision']) then raise exception 'Only the owner can change trip management fields';end if;
 if (to_jsonb(new)-array['updated_at','trip_revision']) is distinct from (to_jsonb(old)-array['updated_at','trip_revision']) then new.trip_revision=old.trip_revision+1;else new.trip_revision=old.trip_revision;end if;return new;
end $$;
create trigger shared_trip_revision before update on public.trips for each row execute function public.shared_trip_revision_guard();
drop policy if exists trip_update on public.trips;
create policy trip_update on public.trips for update to authenticated using(public.can_edit_trip(id)) with check(public.can_edit_trip(id));
create policy collaboration_trip_read_boundary on public.trips as restrictive for select to authenticated using(owner_id=auth.uid() or public.can_read_trip(id));
create policy collaboration_trip_insert_boundary on public.trips as restrictive for insert to authenticated with check(owner_id=auth.uid());
create policy collaboration_trip_update_boundary on public.trips as restrictive for update to authenticated using(public.can_edit_trip(id)) with check(public.can_edit_trip(id));
create policy collaboration_trip_delete_boundary on public.trips as restrictive for delete to authenticated using(owner_id=auth.uid());
create or replace function public.save_shared_trip_details(target uuid,expected_revision integer,details jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare t public.trips;begin
 select * into t from public.trips where id=target and creation_state='finalized' and public.can_edit_trip(id) for update;
 if not found then raise exception 'Trip editing permission required';end if;
 if t.trip_revision is distinct from expected_revision then raise exception 'Trip changed. Reload before saving';end if;
 update public.trips set name=details->>'name',start_date=(details->>'start_date')::date,end_date=(details->>'end_date')::date,travelers=(details->>'travelers')::integer,style=details->>'style',currency=details->>'currency',budget=(details->>'budget')::numeric where id=target;
end $$;

-- Explicit opt-in sharing. Old files, including confirmations, remain private.
create or replace function public.trip_file_readable(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.booking_attachments a where a.id=target and ((a.file_scope='private' and a.owner_id=auth.uid()) or (a.file_scope='shared' and public.can_read_trip(a.trip_id))))
$$;
create or replace function public.trip_file_manageable(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.booking_attachments a where a.id=target and ((a.owner_id=auth.uid() and (a.file_scope='private' or public.can_edit_trip(a.trip_id))) or (a.file_scope='shared' and public.owns_trip(a.trip_id))))
$$;
create policy collaboration_file_read on public.booking_attachments for select to authenticated using(public.trip_file_readable(id));
create policy collaboration_owner_shared_delete on public.booking_attachments for delete to authenticated using(file_scope='shared' and public.owns_trip(trip_id));
create policy collaboration_file_read_boundary on public.booking_attachments as restrictive for select to authenticated using((file_scope='private' and owner_id=auth.uid()) or (file_scope='shared' and public.can_read_trip(trip_id)));
create policy collaboration_file_update_boundary on public.booking_attachments as restrictive for update to authenticated using(public.trip_file_manageable(id)) with check(owner_id=auth.uid() and (file_scope='private' or public.can_edit_trip(trip_id)));
create policy collaboration_file_delete_boundary on public.booking_attachments as restrictive for delete to authenticated using(public.trip_file_manageable(id));
create or replace function public.shared_file_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.file_scope='shared' and (new.document_category='Passport & ID' or not public.can_edit_trip(new.trip_id) or not exists(select 1 from public.trips where id=new.trip_id and creation_state='finalized') or new.intake_id is not null and new.booking_id is null) then raise exception 'Only finalized trip files can be explicitly shared; identity documents stay private';end if;
 if tg_op='UPDATE' and new.file_scope is distinct from old.file_scope and (new.owner_id<>auth.uid() or not public.can_edit_trip(new.trip_id)) then raise exception 'Only the active uploader can change file sharing';end if;return new;
end $$;
create trigger shared_file_scope before insert or update on public.booking_attachments for each row execute function public.shared_file_guard();
create or replace function public.set_trip_file_scope(target uuid,document uuid,expected_revision integer,scope text) returns void language plpgsql security invoker set search_path='' as $$
declare a public.booking_attachments;begin
 select * into a from public.booking_attachments where id=document and trip_id=target and owner_id=auth.uid() for update;
 if not found or not public.can_edit_trip(target) then raise exception 'File sharing permission required';end if;
 if a.document_revision is distinct from expected_revision then raise exception 'Document changed. Reload before sharing';end if;
 if scope is null or scope not in ('private','shared') then raise exception 'Choose a valid sharing scope';end if;
 update public.booking_attachments set file_scope=scope where id=a.id;
end $$;
-- Read and mutation policies MUST use different predicates: reading a shared
-- confirmation never grants another editor permission to overwrite/delete it.
create or replace function public.can_access_booking_file(object_name text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.booking_attachments a where a.path=object_name and public.trip_file_readable(a.id))
$$;
drop policy if exists pfew_booking_files_insert on storage.objects;
create policy pfew_booking_files_insert on storage.objects for insert to authenticated with check(bucket_id='booking-files' and exists(select 1 from public.booking_attachments a where a.path=name and a.owner_id=auth.uid() and a.state='pending' and public.can_edit_trip(a.trip_id)));
drop policy if exists pfew_booking_files_delete on storage.objects;
create policy pfew_booking_files_delete on storage.objects for delete to authenticated using(bucket_id='booking-files' and exists(select 1 from public.booking_attachments a where a.path=name and public.trip_file_manageable(a.id)));
create policy collaboration_storage_read_boundary on storage.objects as restrictive for select to authenticated using(bucket_id<>'booking-files' or public.can_access_booking_file(name));
create policy collaboration_storage_insert_boundary on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'booking-files' or exists(select 1 from public.booking_attachments a where a.path=name and a.owner_id=auth.uid() and a.state='pending' and public.can_edit_trip(a.trip_id)));
create policy collaboration_storage_delete_boundary on storage.objects as restrictive for delete to authenticated using(bucket_id<>'booking-files' or exists(select 1 from public.booking_attachments a where a.path=name and public.trip_file_manageable(a.id)));
create policy collaboration_storage_no_overwrite on storage.objects as restrictive for update to authenticated using(bucket_id<>'booking-files') with check(bucket_id<>'booking-files');
create policy collaboration_storage_no_anon on storage.objects as restrictive for all to anon using(bucket_id<>'booking-files') with check(bucket_id<>'booking-files');


-- RLS does not constrain TRUNCATE. The previous live audit found this excess
-- privilege. Remove it only on known Pfew app tables, preserving normal CRUD.
do $$declare tab text;role_name text;begin
 foreach tab in array array['profiles','trips','trip_segments','trip_hub_preferences','bookings','booking_attachments','prep_tasks','packing_lists','packing_items','packing_templates','budget_settings','budget_allocations','expenses','saved_places','ai_suggestions','finding_decisions','service_budget_settings','service_usage','trip_check_findings','trip_check_runs','trip_members','trip_invitations','audit_events','research_notes','trip_onboarding'] loop
 if to_regclass('public.'||tab) is not null then
  execute format('revoke truncate on table public.%I from public,anon,authenticated',tab);
  foreach role_name in array array['anon','authenticated'] loop
   if has_table_privilege(role_name,to_regclass('public.'||tab),'TRUNCATE') then raise exception 'Inherited TRUNCATE privilege requires administrator review on %',tab;end if;
  end loop;
 end if;
 end loop;
end $$;
create policy collaboration_file_no_anon on public.booking_attachments as restrictive for all to anon using(false) with check(false);
create policy collaboration_trip_no_anon on public.trips as restrictive for all to anon using(false) with check(false);

-- Keep the existing private-file deletion protection while letting the trip
-- owner clean up explicitly shared files, including after uploader revocation.
create or replace function public.has_other_private_files(target uuid,booking uuid default null) returns boolean language plpgsql security definer set search_path='' as $$begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 return exists(select 1 from public.booking_attachments a where a.trip_id=target and (booking is null or a.booking_id=booking) and a.owner_id<>auth.uid() and not(a.file_scope='shared' and public.owns_trip(target)));
end $$;

-- Pin all exposed function grants even on projects with permissive default ACLs.
do $$declare f regprocedure;begin
 foreach f in array array[
 'public.has_other_private_files(uuid,uuid)'::regprocedure,'public.collaboration_version()'::regprocedure,'public.can_read_trip(uuid)'::regprocedure,'public.can_edit_trip(uuid)'::regprocedure,
 'public.create_trip_invitation(uuid,text,text)'::regprocedure,'public.preview_trip_invitation(text)'::regprocedure,
 'public.accept_trip_invitation(text)'::regprocedure,'public.decline_trip_invitation(text)'::regprocedure,'public.respond_trip_invitation(uuid,boolean)'::regprocedure,
 'public.list_my_trip_invitations()'::regprocedure,'public.revoke_trip_invitation(uuid,uuid)'::regprocedure,'public.manage_trip_member(uuid,uuid,integer,boolean)'::regprocedure,
 'public.save_shared_trip_details(uuid,integer,jsonb)'::regprocedure,'public.set_trip_file_scope(uuid,uuid,integer,text)'::regprocedure,
 'public.trip_file_readable(uuid)'::regprocedure,'public.trip_file_manageable(uuid)'::regprocedure,'public.can_access_booking_file(text)'::regprocedure,
 'public.shared_file_guard()'::regprocedure,'public.shared_trip_revision_guard()'::regprocedure] loop
 execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated',f);
 if exists(select 1 from pg_catalog.pg_proc p where p.oid=f and p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then raise exception 'Collaboration functions require trusted migration ownership';end if;
 end loop;
end $$;
commit;
