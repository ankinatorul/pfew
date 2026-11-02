-- Safe to rerun after a completed or partially applied manual SQL Editor setup.
begin;
alter table public.trip_segments add column if not exists destination_id uuid;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.trip_segments'::regclass and conname='trip_segments_destination_id_fkey') then
   alter table public.trip_segments add constraint trip_segments_destination_id_fkey foreign key(destination_id) references public.trip_segments(id) on delete set null;
 end if;
end $$;
create index if not exists segments_destination on public.trip_segments(destination_id);
create or replace function public.validate_destination_link() returns trigger language plpgsql set search_path='' as $$
begin
 if new.destination_id is not null and (new.destination_id=new.id or new.kind='destination' or not exists(select 1 from public.trip_segments d where d.id=new.destination_id and d.kind='destination' and d.trip_id=new.trip_id)) then
   raise exception 'Choose a destination from the same trip';
 end if;
 if exists(select 1 from public.trip_segments s where s.destination_id=new.id and (new.kind<>'destination' or s.trip_id<>new.trip_id)) then
   raise exception 'Unlink destination items before changing destination type or trip';
 end if;
 return new;
end $$;
create or replace trigger segment_destination before insert or update on public.trip_segments for each row execute function public.validate_destination_link();
-- Invoker privileges preserve RLS. One function call is one transaction: no partial trips.
create or replace function public.create_trip_with_destinations(trip_data jsonb,destinations jsonb default '[]') returns uuid language plpgsql security invoker set search_path='' as $$
declare trip_id uuid; d jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if jsonb_typeof(destinations)<>'array' or jsonb_array_length(destinations)>32 then raise exception 'Invalid destinations';end if;
 insert into public.trips(owner_id,name,start_date,end_date,timezone,travelers,style,currency,budget)
 values(auth.uid(),trip_data->>'name',(trip_data->>'start_date')::date,(trip_data->>'end_date')::date,trip_data->>'timezone',(trip_data->>'travelers')::integer,trip_data->>'style',trip_data->>'currency',(trip_data->>'budget')::numeric) returning id into trip_id;
 for d in select value from jsonb_array_elements(destinations) loop
   insert into public.trip_segments(trip_id,kind,title,start_date,end_date,timezone,status)
   values(trip_id,'destination',d->>'title',(d->>'start_date')::date,(d->>'end_date')::date,d->>'timezone','planned');
 end loop;
 return trip_id;
end $$;
revoke all on function public.create_trip_with_destinations(jsonb,jsonb) from public;
grant execute on function public.create_trip_with_destinations(jsonb,jsonb) to authenticated;
create or replace function public.valid_time_zone(zone text) returns boolean language sql stable set search_path='' as $$select exists(select 1 from pg_catalog.pg_timezone_names where name=zone)$$;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.trips'::regclass and conname='trip_time_zone') then
   alter table public.trips add constraint trip_time_zone check(public.valid_time_zone(timezone));
 end if;
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.trip_segments'::regclass and conname='segment_time_zone') then
   alter table public.trip_segments add constraint segment_time_zone check(public.valid_time_zone(timezone));
 end if;
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.trip_segments'::regclass and conname='arrival_time_zone') then
   alter table public.trip_segments add constraint arrival_time_zone check(arrival_timezone='' or public.valid_time_zone(arrival_timezone));
 end if;
end $$;
commit;
