-- PREPARED ONLY. Requires 023, 019 and their dependencies. No data backfill.
-- Reuses trips.draft_data.destinations and trip_segments; no parallel tables.
begin;
create function public.destination_management_version() returns integer language sql stable security invoker set search_path='' as $$select 1$$;
create function public.change_trip_destination(target uuid,expected_revision integer,source_kind text,entry_key text,segment_revision integer,operation text,details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare t public.trips;s public.trip_segments;items jsonb;old_item jsonb;item jsonb;loc jsonb;old_location text;new_location text;starts date;ends date;idx integer;linked_idx integer;ids text[];expected_ids text[];part jsonb;pos integer;new_items jsonb;begin
 if auth.uid() is null or not public.can_edit_trip(target) then raise exception 'Trip editing permission required';end if;
 select * into t from public.trips where id=target and creation_state='finalized' for update;
 if not found or not public.can_edit_trip(target) then raise exception 'Finalized trip unavailable';end if;
 if t.trip_revision is distinct from expected_revision then raise exception 'Trip changed';end if;
 if source_kind is null or source_kind not in ('saved','segment') or operation is null or operation not in ('save','remove','reorder') then raise exception 'Invalid destination operation';end if;
 items=coalesce(t.draft_data->'destinations','[]'::jsonb);
 if jsonb_typeof(items)<>'array' then raise exception 'Destination data needs review';end if;
 if operation='reorder' then
  if jsonb_typeof(details->'ids') is distinct from 'array' or jsonb_typeof(details->'segments') is distinct from 'array' or jsonb_array_length(details->'ids') not between 1 and 500 then raise exception 'Invalid destination order';end if;
  select array_agg(value) into ids from jsonb_array_elements_text(details->'ids');
  if (select count(distinct x) from unnest(ids)x)<>array_length(ids,1) then raise exception 'Duplicate destination';end if;
  perform 1 from public.trip_segments where trip_id=target and kind='destination' and status<>'idea' order by id for update;
  select array_agg(key order by key) into expected_ids from (
   select id::text as key from public.trip_segments where trip_id=target and kind='destination' and status<>'idea'
   union all select 'saved:'||(ordinality-1)::text from jsonb_array_elements(items) with ordinality where not exists(select 1 from public.trip_segments where trip_id=target and kind='destination' and status<>'idea' and location_id=value->>'id')
  ) list;
  if expected_ids is distinct from (select array_agg(x order by x) from unnest(ids)x) then raise exception 'Destinations changed';end if;
  if jsonb_array_length(details->'segments')<>(select count(*) from public.trip_segments where trip_id=target and kind='destination' and status<>'idea') or (select count(distinct value->>'id') from jsonb_array_elements(details->'segments'))<>jsonb_array_length(details->'segments') then raise exception 'Destinations changed';end if;
  for part in select value from jsonb_array_elements(details->'segments') loop
   if not exists(select 1 from public.trip_segments where id=(part->>'id')::uuid and trip_id=target and kind='destination' and status<>'idea' and itinerary_revision=(part->>'revision')::integer) then raise exception 'Destinations changed';end if;
  end loop;
  for pos in 1..array_length(ids,1) loop
   if ids[pos] !~ '^saved:' then update public.trip_segments set position=pos-1 where id=ids[pos]::uuid and trip_id=target;end if;
  end loop;
  new_items='[]'::jsonb;
  for part in select value||jsonb_build_object('position',coalesce(
    (select min(position) from public.trip_segments where trip_id=target and kind='destination' and status<>'idea' and location_id=value->>'id'),
    array_position(ids,'saved:'||(ordinality-1)::text)-1)) as item
    from jsonb_array_elements(items) with ordinality
    order by coalesce((select min(position) from public.trip_segments where trip_id=target and kind='destination' and status<>'idea' and location_id=value->>'id'),array_position(ids,'saved:'||(ordinality-1)::text)-1)
  loop
   if jsonb_typeof(part)<>'object' or coalesce(length(part->>'label'),0)=0 then raise exception 'Destination data needs review';end if;
   new_items=new_items||jsonb_build_array(part);
  end loop;
  update public.trips set draft_data=jsonb_set(draft_data,'{destinations}',new_items) where id=target;
  return;
 end if;
 if source_kind='segment' then
  select * into s from public.trip_segments where id=entry_key::uuid and trip_id=target and kind='destination' and status<>'idea' for update;
  if not found or s.itinerary_revision is distinct from segment_revision then raise exception 'Destination changed';end if;
  old_location=s.location_id;
  select (ordinality-1)::integer into linked_idx from jsonb_array_elements(items) with ordinality where value->>'id'=old_location limit 1;
  old_item=case when linked_idx is null then '{}'::jsonb else items->linked_idx end;
 else
  if entry_key='new' and operation='save' then
   if jsonb_array_length(items)>=500 then raise exception 'Too many destinations';end if;
   idx=jsonb_array_length(items);old_item='{}'::jsonb;
  else
   if entry_key is null or entry_key !~ '^[0-9]+$' then raise exception 'Destination unavailable';end if;
   idx=entry_key::integer;old_item=items->idx;
   if old_item is null or jsonb_typeof(old_item)<>'object' then raise exception 'Destination unavailable';end if;
  end if;
  old_location=old_item->>'id';
 end if;
 if operation='remove' then
  if source_kind='segment' then
   -- Existing FK actions retain bookings/plans and clear their destination link.
   -- Block newer string links that have no FK rather than leave stale references.
   if exists(select 1 from public.trip_segments where trip_id=target and destination_location_id=old_location) then raise exception 'Move linked plans first';end if;
   delete from public.trip_segments where id=s.id and trip_id=target;
   if linked_idx is not null and not exists(select 1 from public.trip_segments where trip_id=target and kind='destination' and location_id=old_location) then items=items-linked_idx;end if;
  else
   if exists(select 1 from public.trip_segments where trip_id=target and (destination_location_id=old_location or (kind='destination' and location_id=old_location))) then raise exception 'Move linked plans first';end if;
   items=items-idx;
  end if;
 else
  if jsonb_typeof(details) is distinct from 'object' or coalesce(length(btrim(details->>'title')),0) not between 1 and 200 or coalesce(length(details->>'notes'),0)>4000 then raise exception 'Invalid destination details';end if;
  starts=nullif(details->>'start_date','')::date;ends=nullif(details->>'end_date','')::date;
  if (starts is not null and (starts<t.start_date or starts>t.end_date)) or (ends is not null and (ends<t.start_date or ends>t.end_date)) or (starts is not null and ends is not null and ends<starts) then raise exception 'Invalid destination dates';end if;
  if source_kind='segment' and (starts is null or ends is null) then raise exception 'Dated stops require both dates';end if;
  new_location=nullif(details->>'location_id','');loc=details->'location';
  if new_location is distinct from old_location or (source_kind='saved' and entry_key='new') then
   if new_location is null or jsonb_typeof(loc) is distinct from 'object' or loc->>'id' is distinct from new_location or coalesce(length(loc->>'label'),0) not between 1 and 500 or jsonb_typeof(loc->'latitude') is distinct from 'number' or jsonb_typeof(loc->'longitude') is distinct from 'number' or (loc->>'latitude')::numeric not between -90 and 90 or (loc->>'longitude')::numeric not between -180 and 180 or not public.valid_time_zone(loc->>'timezone') then raise exception 'Selected location required';end if;
   if old_location is not null and exists(select 1 from public.trip_segments where trip_id=target and destination_location_id=old_location) then raise exception 'Move linked plans first';end if;
   item=(old_item-array['id','label','city','country','latitude','longitude','timezone','source','providerId','google_place_id'])||loc;
  else item=old_item;end if;
  item=item||jsonb_build_object('title',btrim(details->>'title'),'start_date',starts,'end_date',ends,'notes',coalesce(details->>'notes',''));
  if source_kind='segment' then
   update public.trip_segments set title=btrim(details->>'title'),start_date=starts,end_date=ends,notes=coalesce(details->>'notes',''),
    location_id=case when new_location is distinct from old_location then loc->>'id' else location_id end,
    google_place_id=case when new_location is distinct from old_location then null else google_place_id end,
    location_label=case when new_location is distinct from old_location then loc->>'label' else location_label end,
    latitude=case when new_location is distinct from old_location then (loc->>'latitude')::double precision else latitude end,
    longitude=case when new_location is distinct from old_location then (loc->>'longitude')::double precision else longitude end,
    timezone=case when new_location is distinct from old_location then loc->>'timezone' else timezone end where id=s.id and trip_id=target;
   -- Keep a unique saved counterpart consistent, without changing other visits.
   if linked_idx is not null and (select count(*) from public.trip_segments where trip_id=target and kind='destination' and location_id=old_location and id<>s.id)=0 then items=jsonb_set(items,array[linked_idx::text],item);end if;
  elsif entry_key='new' then items=items||jsonb_build_array(item);
  else items=jsonb_set(items,array[idx::text],item);end if;
 end if;
 if items is distinct from coalesce(t.draft_data->'destinations','[]'::jsonb) then update public.trips set draft_data=jsonb_set(draft_data,'{destinations}',items) where id=target;end if;
end $$;
-- The privileged function may change only destinations. No user-settable flags.
-- Retain 023's exact-permutation allowance for its security-invoker reorder RPC.
create or replace function public.shared_trip_revision_guard() returns trigger language plpgsql set search_path='' as $$
declare safe_change boolean=false;old_dest jsonb;new_dest jsonb;writer name;begin
 if auth.uid() is not null and auth.uid()<>old.owner_id and
 (to_jsonb(new)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision']) is distinct from
 (to_jsonb(old)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision']) then
  if old.creation_state='finalized' and public.can_edit_trip(old.id) and
   (to_jsonb(new)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision','draft_data']) is not distinct from
   (to_jsonb(old)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision','draft_data']) and
   (new.draft_data-'destinations') is not distinct from (old.draft_data-'destinations') and
   jsonb_typeof(new.draft_data->'destinations')='array' and jsonb_typeof(old.draft_data->'destinations')='array' then
   select pg_catalog.pg_get_userbyid(p.proowner) into writer from pg_catalog.pg_proc p where p.oid='public.change_trip_destination(uuid,integer,text,text,integer,text,jsonb)'::regprocedure;
   if current_user=writer then safe_change=true;
   else
    select jsonb_agg(value order by value) into old_dest from jsonb_array_elements(old.draft_data->'destinations');
    select jsonb_agg(value order by value) into new_dest from jsonb_array_elements(new.draft_data->'destinations');
    safe_change=old_dest is not distinct from new_dest;
   end if;
  end if;
  if not safe_change then raise exception 'Only the owner can change trip management fields';end if;
 end if;
 if (to_jsonb(new)-array['updated_at','trip_revision']) is distinct from (to_jsonb(old)-array['updated_at','trip_revision']) then new.trip_revision=old.trip_revision+1;else new.trip_revision=old.trip_revision;end if;return new;
end $$;
revoke all on function public.destination_management_version(),public.change_trip_destination(uuid,integer,text,text,integer,text,jsonb) from public,anon;
grant execute on function public.destination_management_version(),public.change_trip_destination(uuid,integer,text,text,integer,text,jsonb) to authenticated;
do $$begin
 if exists(select 1 from pg_catalog.pg_proc where oid='public.change_trip_destination(uuid,integer,text,text,integer,text,jsonb)'::regprocedure and pg_catalog.pg_get_userbyid(proowner) in ('anon','authenticated','service_role')) then raise exception 'Destination writer needs trusted administrator ownership';end if;
end $$;
commit;
