-- PREPARED ONLY. Requires 019 (and its 001–018 dependencies).
-- 020 remains required for People details. 021 is NOT required; if already
-- applied, its historical invitation rows remain unchanged.
-- Old per-person invitation RPC grants are retired; accepted members remain.
-- No existing trips, invitations, memberships, bookings or files are rewritten.
begin;
create table public.trip_share_links (
 trip_id uuid primary key references public.trips(id) on delete cascade,
 -- Recoverable only through the owner's RPC: needed to copy the SAME link
 -- on another device. No API role receives direct table access. Hash used
 -- for all join lookups; never expose this table through trip queries.
 secret text not null check(secret ~ '^[a-f0-9]{64}$'),
 secret_hash text not null unique check(secret_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default true,
 revision integer not null default 1 check(revision>0)
);
alter table public.trip_share_links enable row level security;
revoke all on public.trip_share_links from public,anon,authenticated,service_role;

create function public.reusable_sharing_version() returns integer
language sql stable security invoker set search_path='' as $$select 1$$;

-- Parent lock is shared with 019 membership management and join below.
-- Expected revisions prevent an old owner tab from undoing disable/reset.
create function public.manage_trip_share_link(target uuid,operation text,expected_revision integer,candidate text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.trip_share_links;begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)) then raise exception 'Sign in required';end if;
 perform 1 from public.trips where id=target and owner_id=auth.uid() and creation_state='finalized' for update;
 if not found then raise exception 'Only the finalized trip owner can manage sharing';end if;
 select * into l from public.trip_share_links where trip_id=target for update;
 if operation='read' then
  return jsonb_build_object('enabled',coalesce(l.enabled,false),'revision',coalesce(l.revision,0),'secret',case when l.enabled then l.secret end);
 end if;
 if operation is null or operation not in ('enable','disable','reset') then raise exception 'Invalid sharing operation';end if;
 if expected_revision is null or expected_revision<>coalesce(l.revision,0) then raise exception 'Sharing changed. Refresh before trying again';end if;
 if operation='disable' then
  if l.trip_id is not null then update public.trip_share_links set enabled=false,revision=revision+1 where trip_id=target returning * into l;end if;
 else
  -- Repeated enable never rotates an active link. Re-enabling after disable
  -- rotates so links explicitly invalidated by disabling never revive.
  if operation='reset' or not coalesce(l.enabled,false) then
   if candidate is null or candidate !~ '^[a-f0-9]{64}$' then raise exception 'Secure sharing secret required';end if;
   insert into public.trip_share_links(trip_id,secret,secret_hash,enabled)
   values(target,candidate,encode(sha256(convert_to(candidate,'UTF8')),'hex'),true)
   on conflict(trip_id) do update set secret=excluded.secret,secret_hash=excluded.secret_hash,enabled=true,revision=public.trip_share_links.revision+1 returning * into l;
  end if;
 end if;
 return jsonb_build_object('enabled',coalesce(l.enabled,false),'revision',coalesce(l.revision,0),'secret',case when l.enabled then l.secret end);
end $$;

create function public.preview_trip_share_link(link_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.trips;begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)) then raise exception 'Sign in required';end if;
 select tr.* into t from public.trip_share_links l join public.trips tr on tr.id=l.trip_id
 where l.secret_hash=link_hash and l.enabled and tr.creation_state='finalized';
 if not found then return jsonb_build_object('state','invalid');end if;
 if public.can_read_trip(t.id) then return jsonb_build_object('state','already_member','trip_id',t.id);end if;
 -- Only the authenticated holder sees the minimum explicit-join preview.
 return jsonb_build_object('state','valid','trip_name',t.name);
end $$;

create function public.join_trip_share_link(link_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid;l public.trip_share_links;begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)) then raise exception 'Sign in required';end if;
 select trip_id into target from public.trip_share_links where secret_hash=link_hash and enabled;
 if target is null then raise exception 'Sharing link unavailable';end if;
 perform 1 from public.trips where id=target and creation_state='finalized' for update;
 if not found then raise exception 'Sharing link unavailable';end if;
 select * into l from public.trip_share_links where trip_id=target for update;
 -- Revalidate AFTER acquiring the lock: disable/reset cannot race acceptance.
 if not l.enabled or l.secret_hash<>link_hash then raise exception 'Sharing link unavailable';end if;
 if exists(select 1 from public.trips where id=target and owner_id=auth.uid()) then return target;end if;
 if exists(select 1 from public.trip_members where trip_id=target and user_id=auth.uid() and revoked_at is null and role='editor') then return target;end if;
 insert into public.trip_members(trip_id,user_id,role) values(target,auth.uid(),'editor')
 on conflict(trip_id,user_id) do update set role='editor',revoked_at=null,member_revision=public.trip_members.member_revision+1;
 return target;
end $$;
revoke all on function public.reusable_sharing_version(),public.manage_trip_share_link(uuid,text,integer,text),public.preview_trip_share_link(text),public.join_trip_share_link(text) from public,anon,authenticated,service_role;
grant execute on function public.reusable_sharing_version(),public.manage_trip_share_link(uuid,text,integer,text),public.preview_trip_share_link(text),public.join_trip_share_link(text) to authenticated;
-- Retire old recipient/single-use API paths without modifying their records.
-- Optional 021 functions are discovered so this works directly after 019.
do $$declare sig text;routine regprocedure;begin
 foreach sig in array array[
  'public.create_trip_invitation(uuid,text,text)',
  'public.create_trip_link(uuid,text)',
  'public.preview_trip_invitation(text)',
  'public.accept_trip_invitation(text)',
  'public.decline_trip_invitation(text)',
  'public.respond_trip_invitation(uuid,boolean)',
  'public.list_my_trip_invitations()'
 ] loop
  routine=to_regprocedure(sig);
  if routine is not null then execute format('revoke all on function %s from public,anon,authenticated,service_role',routine);end if;
 end loop;
end $$;
do $$begin
 if exists(select 1 from pg_catalog.pg_proc p where p.oid in ('public.manage_trip_share_link(uuid,text,integer,text)'::regprocedure,'public.preview_trip_share_link(text)'::regprocedure,'public.join_trip_share_link(text)'::regprocedure) and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then raise exception 'Sharing functions require trusted migration administrator ownership';end if;
end $$;
commit;
