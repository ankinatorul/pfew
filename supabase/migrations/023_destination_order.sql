-- PREPARED ONLY. Requires 019 and 014. No new tables or location data.
-- Atomic ordering of existing destination segments / existing saved JSON list.
begin;
create function public.destination_order_version() returns integer language sql stable security invoker set search_path='' as $$select 1$$;
create function public.reorder_trip_destinations(target uuid,expected_revision integer,ordered_ids jsonb,segment_versions jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare t public.trips;ids text[];existing_ids text[];part jsonb;i integer;destinations jsonb;begin
 select * into t from public.trips where id=target and creation_state='finalized' and public.can_edit_trip(id) for update;
 if not found then raise exception 'Trip editing permission required';end if;
 if t.trip_revision is distinct from expected_revision then raise exception 'Trip changed. Reload before reordering';end if;
 if jsonb_typeof(ordered_ids) is distinct from 'array' or jsonb_array_length(ordered_ids) not between 1 and 500 then raise exception 'Invalid destination order';end if;
 select array_agg(value) into ids from jsonb_array_elements_text(ordered_ids);
 if (select count(distinct x) from unnest(ids) x)<>array_length(ids,1) then raise exception 'Duplicate destination';end if;
 perform 1 from public.trip_segments where trip_id=target and kind='destination' and status<>'idea' order by id for update;
 select array_agg(id::text order by id::text) into existing_ids from public.trip_segments where trip_id=target and kind='destination' and status<>'idea';
 if existing_ids is not null then
  if existing_ids is distinct from (select array_agg(x order by x) from unnest(ids)x) or jsonb_typeof(segment_versions) is distinct from 'array' or jsonb_array_length(segment_versions)<>array_length(ids,1) then raise exception 'Destinations changed. Reload before reordering';end if;
  for part in select value from jsonb_array_elements(segment_versions) loop
   if not exists(select 1 from public.trip_segments where id=(part->>'id')::uuid and trip_id=target and kind='destination' and status<>'idea' and itinerary_revision=(part->>'revision')::integer) then raise exception 'Destinations changed. Reload before reordering';end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(segment_versions))<>array_length(ids,1) then raise exception 'Invalid destination revisions';end if;
  for i in 1..array_length(ids,1) loop update public.trip_segments set position=i-1 where id=ids[i]::uuid and trip_id=target;end loop;
  -- Segment revision guards detect concurrent ordering without altering dates.
 else
  destinations=coalesce(t.draft_data->'destinations','[]'::jsonb);
  select array_agg((ordinality-1)::text order by (ordinality-1)::text) into existing_ids from jsonb_array_elements(destinations) with ordinality;
  if existing_ids is distinct from (select array_agg(x order by x) from unnest(ids)x) then raise exception 'Destinations changed. Reload before reordering';end if;
  select jsonb_agg(destinations->(x::integer) order by ordinality) into destinations from unnest(ids) with ordinality as list(x,ordinality);
  update public.trips set draft_data=jsonb_set(draft_data,'{destinations}',destinations) where id=target;
 end if;
end $$;
-- Extend 019's guard only for a permutation of the exact same saved
-- destination objects. Editors cannot insert/alter locations, draft metadata,
-- publication, ownership or themes through this exception. RLS still applies.
create or replace function public.shared_trip_revision_guard() returns trigger language plpgsql set search_path='' as $$
declare safe_order boolean=false;old_dest jsonb;new_dest jsonb;begin
 if auth.uid() is not null and auth.uid()<>old.owner_id and
 (to_jsonb(new)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision']) is distinct from
 (to_jsonb(old)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision']) then
  if old.creation_state='finalized' and public.can_edit_trip(old.id) and
   (to_jsonb(new)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision','draft_data']) is not distinct from
   (to_jsonb(old)-array['name','start_date','end_date','travelers','style','currency','budget','timezone','updated_at','trip_revision','draft_data']) and
   (new.draft_data-'destinations') is not distinct from (old.draft_data-'destinations') and
   jsonb_typeof(new.draft_data->'destinations')='array' and jsonb_typeof(old.draft_data->'destinations')='array' then
   select jsonb_agg(value order by value) into old_dest from jsonb_array_elements(old.draft_data->'destinations');
   select jsonb_agg(value order by value) into new_dest from jsonb_array_elements(new.draft_data->'destinations');
   safe_order=old_dest is not distinct from new_dest;
  end if;
  if not safe_order then raise exception 'Only the owner can change trip management fields';end if;
 end if;
 if (to_jsonb(new)-array['updated_at','trip_revision']) is distinct from (to_jsonb(old)-array['updated_at','trip_revision']) then new.trip_revision=old.trip_revision+1;else new.trip_revision=old.trip_revision;end if;return new;
end $$;
revoke all on function public.destination_order_version(),public.reorder_trip_destinations(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.destination_order_version(),public.reorder_trip_destinations(uuid,integer,jsonb,jsonb) to authenticated;
commit;
