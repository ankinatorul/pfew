begin;
do $$ declare tab text; prefix text;begin
 foreach tab in array array['trip_segments','bookings'] loop
 execute format('alter table public.%I add column if not exists location_id text,add column if not exists location_label text,add column if not exists latitude double precision check(latitude between -90 and 90),add column if not exists longitude double precision check(longitude between -180 and 180)',tab);
 prefix=case when tab='bookings' then 'end_' else 'arrival_' end;
 execute format('alter table public.%I add column if not exists %I text,add column if not exists %I text,add column if not exists %I double precision check(%I between -90 and 90),add column if not exists %I double precision check(%I between -180 and 180)',tab,prefix||'location_id',prefix||'location_label',prefix||'latitude',prefix||'latitude',prefix||'longitude',prefix||'longitude');
 end loop;
end $$;
create or replace function public.sync_trip_timezone() returns trigger language plpgsql set search_path='' as $$
declare target uuid;zone text;
begin
 target=case when tg_op='DELETE' then old.trip_id else new.trip_id end;
 select s.timezone into zone from public.trip_segments s where s.trip_id=target and s.kind='destination' and s.status<>'idea' order by s.start_date,s.position,s.id limit 1;
 if zone is not null then update public.trips set timezone=zone where id=target and timezone<>zone;end if;
 return null;
end $$;
create or replace trigger sync_location_timezone after insert or update or delete on public.trip_segments for each row execute function public.sync_trip_timezone();
create or replace function public.create_trip_with_destinations(trip_data jsonb,destinations jsonb default '[]') returns uuid language plpgsql security invoker set search_path='' as $$
declare trip_id uuid;d jsonb;ordinal integer=0;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if jsonb_typeof(destinations)<>'array' or jsonb_array_length(destinations)>32 then raise exception 'Invalid destinations';end if;
 insert into public.trips(owner_id,name,start_date,end_date,timezone,travelers,style,currency,budget)
 values(auth.uid(),trip_data->>'name',(trip_data->>'start_date')::date,(trip_data->>'end_date')::date,trip_data->>'timezone',(trip_data->>'travelers')::integer,trip_data->>'style',trip_data->>'currency',(trip_data->>'budget')::numeric) returning id into trip_id;
 for d in select value from jsonb_array_elements(destinations) loop
 insert into public.trip_segments(trip_id,kind,title,start_date,end_date,timezone,status,position,location_id,location_label,latitude,longitude)
 values(trip_id,'destination',d->>'title',(d->>'start_date')::date,(d->>'end_date')::date,d->>'timezone','planned',ordinal,d->>'location_id',d->>'location_label',(d->>'latitude')::double precision,(d->>'longitude')::double precision);
 ordinal=ordinal+1;
 end loop;
 return trip_id;
end $$;
revoke all on function public.create_trip_with_destinations(jsonb,jsonb) from public;
grant execute on function public.create_trip_with_destinations(jsonb,jsonb) to authenticated;
-- Linked plans without an explicitly selected city follow their destination.
create or replace function public.sync_linked_location_timezones() returns trigger language plpgsql set search_path='' as $$begin
 if new.kind='destination' and new.timezone<>old.timezone then
   update public.trip_segments set timezone=new.timezone where destination_id=new.id and location_id is null and timezone=old.timezone;
   update public.bookings b set timezone=new.timezone,end_timezone=case when b.category='accommodation' and b.end_location_id is null and b.end_timezone=old.timezone then new.timezone else b.end_timezone end
     where b.trip_id=new.trip_id and b.location_id is null and b.timezone=old.timezone and (b.segment_id=new.id or b.segment_id in (select s.id from public.trip_segments s where s.destination_id=new.id and s.location_id is null));
 end if;return null;
end $$;
create or replace trigger sync_linked_zones after update of timezone on public.trip_segments for each row execute function public.sync_linked_location_timezones();
commit;
