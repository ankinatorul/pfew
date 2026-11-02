begin;
create table public.profiles (id uuid primary key references auth.users on delete cascade, display_name text, created_at timestamptz not null default now());
create table public.trips (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 120),start_date date not null,end_date date not null,
 timezone text not null,travelers integer not null default 1 check(travelers between 1 and 100),
 style text not null check(style in ('Budget','Comfort','Luxury')),currency text not null check(currency ~ '^[A-Z]{3}$'),
 budget numeric check(budget>=0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(end_date>=start_date));
create index trips_owner_dates on public.trips(owner_id,start_date);
-- Segments represent independent destination periods, stays, transportation, and plans.
-- A stay need not correspond one-to-one to a destination. Future typed details reference segment IDs.
create table public.trip_segments (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,
 kind text not null check(kind in ('destination','stay','transport','activity','note')),title text not null check(length(title) between 1 and 200),
 start_date date not null,end_date date not null,local_time text not null default '' check(local_time='' or local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 timezone text not null,status text not null default 'planned' check(status in ('planned','confirmed','idea')),
 address text not null default '' check(length(address)<=500), provider text not null default '' check(length(provider)<=200), reference text not null default '' check(length(reference)<=200), origin text not null default '' check(length(origin)<=500),arrival_location text not null default '' check(length(arrival_location)<=500),arrival_time text not null default '' check(arrival_time='' or arrival_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),arrival_timezone text not null default '',transport_mode text not null default '' check(transport_mode in ('','flight','train','ferry','transfer','rental car','bus','other')),notes text not null default '' check(length(notes)<=4000),position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(end_date>=start_date));
create index segments_trip_dates on public.trip_segments(trip_id,start_date,end_date);
create table public.trip_hub_preferences(trip_id uuid primary key references public.trips on delete cascade,layout jsonb not null default '[]' check(jsonb_typeof(layout)='array'),updated_at timestamptz not null default now());
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger trips_updated before update on public.trips for each row execute function public.touch_updated_at();
create trigger segments_updated before update on public.trip_segments for each row execute function public.touch_updated_at();
create trigger preferences_updated before update on public.trip_hub_preferences for each row execute function public.touch_updated_at();
create function public.validate_segment_dates() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.trips t where t.id=new.trip_id and new.start_date>=t.start_date and new.end_date<=t.end_date) then raise exception 'Segment dates must be within trip';end if;return new;end $$;
create trigger segment_dates before insert or update on public.trip_segments for each row execute function public.validate_segment_dates();
create function public.validate_trip_dates() returns trigger language plpgsql set search_path='' as $$ begin
 if exists(select 1 from public.trip_segments s where s.trip_id=new.id and (s.start_date<new.start_date or s.end_date>new.end_date)) then raise exception 'Move segment dates before shortening trip';end if;return new;end $$;
create trigger trip_dates before update on public.trips for each row execute function public.validate_trip_dates();
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_segments enable row level security;
alter table public.trip_hub_preferences enable row level security;
create policy profiles_private on public.profiles for all to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy trips_private on public.trips for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy segments_private on public.trip_segments for all to authenticated using(exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=(select auth.uid()))) with check(exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=(select auth.uid())));
create policy preferences_private on public.trip_hub_preferences for all to authenticated using(exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=(select auth.uid()))) with check(exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.profiles,public.trips,public.trip_segments,public.trip_hub_preferences to authenticated;
commit;
