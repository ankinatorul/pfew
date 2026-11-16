-- PREPARED ONLY. Requires 019; 020 remains the separate people-details RPC.
-- New links have no recipient. Existing rows retain their original email binding.
-- No membership, trip, booking, attachment, RLS or Storage policy is rewritten.
begin;
alter table public.trip_invitations add column invitation_kind text not null default 'email'
 check(invitation_kind in ('email','link'));
alter table public.trip_invitations alter column email drop not null;
alter table public.trip_invitations add constraint invitation_recipient_kind
 check((invitation_kind='email' and email is not null) or (invitation_kind='link' and email is null));

create or replace function public.trip_link_version() returns integer
language sql stable security invoker set search_path='' as $$select 1$$;
create or replace function public.create_trip_link(target uuid,invite_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare ident uuid;begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid()
  and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)) then raise exception 'Sign in required';end if;
 perform 1 from public.trips where id=target and owner_id=auth.uid() and creation_state='finalized' for update;
 if not found then raise exception 'Only owners of finalized trips can invite';end if;
 if invite_hash is null or invite_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid invitation';end if;
 insert into public.trip_invitations(trip_id,email,role,token_hash,expires_at,invitation_kind)
 values(target,null,'editor',invite_hash,now()+interval '7 days','link') returning id into ident;
 return ident;
end $$;

create or replace function public.preview_trip_invitation(invite_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i public.trip_invitations;t public.trips;account_email text;begin
 if auth.uid() is null then return null;end if;
 select * into i from public.trip_invitations where token_hash=invite_hash;
 if not found then return null;end if;
 if i.invitation_kind='link' and not exists(select 1 from auth.users u where u.id=auth.uid()
  and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)) then return null;end if;
 if i.invitation_kind='email' then
  select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if account_email is null or lower(i.email)<>account_email then return null;end if;
 end if;
 if i.revoked_at is not null then return jsonb_build_object('state','revoked');end if;
 if i.declined_at is not null then return jsonb_build_object('state','declined');end if;
 if i.expires_at<=now() then return jsonb_build_object('state','expired');end if;
 if i.accepted_at is not null and i.accepted_by is distinct from auth.uid() then
  return jsonb_build_object('state','used');
 end if;
 select * into t from public.trips where id=i.trip_id and creation_state='finalized';
 if not found or i.role<>'editor' then return null;end if;
 if i.accepted_at is not null then
  if not public.can_read_trip(t.id) then return jsonb_build_object('state','revoked');end if;
  return jsonb_build_object('state','accepted','trip_name',t.name,'trip_id',t.id,'kind',i.invitation_kind);
 end if;
 if i.invitation_kind='link' and public.can_edit_trip(t.id) then
  return jsonb_build_object('state','already_member','trip_name',t.name,'trip_id',t.id,'kind','link');
 end if;
 return jsonb_build_object('state','valid','trip_name',t.name,'kind',i.invitation_kind);
end $$;

create or replace function public.accept_trip_invitation(invite_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.trip_invitations;target uuid;ident uuid;kind text;begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select id,trip_id,invitation_kind into ident,target,kind from public.trip_invitations where token_hash=invite_hash;
 if not found then raise exception 'Invitation unavailable';end if;
 -- The existing legacy operation still enforces verified recipient email,
 -- expiration, decline, revocation and its original acceptance rules.
 if kind='email' then return public.respond_trip_invitation(ident,true);end if;
 if not exists(select 1 from auth.users u where u.id=auth.uid()
  and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)) then raise exception 'Sign in required';end if;
 -- Use the same trip-before-invitation lock order as owner revocation/removal.
 perform 1 from public.trips where id=target and creation_state='finalized' for update;
 if not found then raise exception 'Invitation unavailable';end if;
 select * into i from public.trip_invitations where id=ident and token_hash=invite_hash for update;
 if not found or i.invitation_kind<>'link' or i.role<>'editor' or i.revoked_at is not null
    or i.declined_at is not null or i.expires_at<=now() then raise exception 'Invitation unavailable or expired';end if;
 if i.accepted_at is not null then
  if i.accepted_by=auth.uid() and public.can_read_trip(target) then return target;end if;
  raise exception 'Invitation already used or access removed';
 end if;
 if public.can_edit_trip(target) then raise exception 'Already a collaborator. Open this trip from My Trips';end if;
 insert into public.trip_members(trip_id,user_id,role) values(target,auth.uid(),'editor')
 on conflict(trip_id,user_id) do update set role='editor',revoked_at=null,member_revision=public.trip_members.member_revision+1;
 update public.trip_invitations set accepted_at=now(),accepted_by=auth.uid() where id=ident;
 return target;
end $$;

revoke all on function public.trip_link_version(),public.create_trip_link(uuid,text),
 public.preview_trip_invitation(text),public.accept_trip_invitation(text) from public,anon;
grant execute on function public.trip_link_version(),public.create_trip_link(uuid,text),
 public.preview_trip_invitation(text),public.accept_trip_invitation(text) to authenticated;
do $$begin
 if exists(select 1 from pg_catalog.pg_proc p where p.oid in
 ('public.create_trip_link(uuid,text)'::regprocedure,'public.preview_trip_invitation(text)'::regprocedure,'public.accept_trip_invitation(text)'::regprocedure)
 and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then
  raise exception 'Invitation operations require trusted migration administrator ownership';
 end if;
end $$;
commit;
