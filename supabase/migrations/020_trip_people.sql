-- PREPARED ONLY. Requires reviewed 019. Do not apply without approval.
-- Read-only member details for a single currently accessible finalized trip.
-- No profile RLS, invitation preview, membership, file permission or data changes.
begin;
create or replace function public.trip_people(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_read_trip(target)
    or not exists(select 1 from public.trips where id=target and creation_state='finalized') then
  raise exception 'Trip unavailable';
 end if;
 return (
  with people as (
   select t.owner_id as user_id,null::uuid as membership_id,'owner'::text as role,0 as sort_order
   from public.trips t where t.id=target
   union all
   select m.user_id,m.id,m.role,1 from public.trip_members m
   join public.trips t on t.id=m.trip_id
   where m.trip_id=target and m.revoked_at is null and m.user_id<>t.owner_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
   'user_id',u.id,'membership_id',m.membership_id,'role',m.role,
   'name',coalesce(nullif(left(btrim(p.display_name),120),''),
                   nullif(left(btrim(u.raw_user_meta_data->>'full_name'),120),''),
                   nullif(left(btrim(u.raw_user_meta_data->>'name'),120),'')),
   'email',case when u.email_confirmed_at is not null then u.email else null end,
   'avatar_url',left(coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),2048)
  ) order by m.sort_order,u.id),'[]'::jsonb)
  from people m join auth.users u on u.id=m.user_id
  left join public.profiles p on p.id=u.id
 );
end $$;
revoke all on function public.trip_people(uuid) from public,anon;
grant execute on function public.trip_people(uuid) to authenticated;
do $$begin
 if exists(select 1 from pg_catalog.pg_proc p where p.oid='public.trip_people(uuid)'::regprocedure
  and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then
  raise exception 'Member details require trusted migration administrator ownership';
 end if;
end $$;
commit;
