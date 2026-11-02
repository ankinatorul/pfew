begin;
create table if not exists public.bookings (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips on delete cascade,
 segment_id uuid references public.trip_segments on delete set null,
 title text not null check(length(title) between 1 and 200),category text not null check(category in ('flight','accommodation','ground transport','ferry','car rental','activity','other')),
 provider text not null default '',reference text not null default '',start_date date not null,end_date date not null,local_time text not null default '' check(local_time='' or local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),timezone text not null check(public.valid_time_zone(timezone)),end_local_time text not null default '' check(end_local_time='' or end_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),end_timezone text not null default '' check(end_timezone='' or public.valid_time_zone(end_timezone)),
 origin text not null default '',destination text not null default '',travelers text not null default '',notes text not null default '' check(length(notes)<=4000),
 price numeric(12,2) check(price>=0),paid_amount numeric(12,2) check(paid_amount>=0),currency text not null check(currency ~ '^[A-Z]{3}$'),payment_status text not null default 'unknown' check(payment_status in ('unknown','unpaid','partial','paid')),
 verification text not null default 'unverified' check(verification in ('unverified','user confirmed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(end_date>=start_date),check(price is null or paid_amount is null or paid_amount<=price)
);
create table if not exists public.prep_tasks (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,title text not null check(length(title) between 1 and 200),category text not null default 'Other' check(category in ('Documents','Entry requirements','Health and insurance','Transportation','Accommodation','Payments','Connectivity','Other')),due_date date,priority text not null default 'normal' check(priority in ('low','normal','high')),done boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists public.packing_lists (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,traveler text not null check(length(traveler) between 1 and 100),unique(trip_id,traveler)
);
create table if not exists public.packing_items (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,list_id uuid not null references public.packing_lists on delete cascade,title text not null check(length(title) between 1 and 200),category text not null default 'Essentials',quantity integer not null default 1 check(quantity between 1 and 1000),packed boolean not null default false
);
create table if not exists public.packing_templates (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,name text not null check(length(name) between 1 and 100),items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=100)
);
create table if not exists public.budget_settings (
 trip_id uuid primary key references public.trips on delete cascade,include_prepaid boolean not null default true
);
create table if not exists public.budget_allocations (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,currency text not null check(currency ~ '^[A-Z]{3}$'),category text not null check(length(category) between 1 and 100),day date,destination_id uuid references public.trip_segments on delete set null,planned numeric(12,2) not null check(planned>=0),estimate_low numeric(12,2) check(estimate_low>=0),estimate_high numeric(12,2),notes text not null default '' check(length(notes)<=1000),check((estimate_low is null and estimate_high is null) or (estimate_low is not null and estimate_high is not null and estimate_high>=estimate_low))
);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,amount numeric(12,2) not null check(amount>0),currency text not null check(currency ~ '^[A-Z]{3}$'),category text not null check(length(category) between 1 and 100),day date not null,payment_method text not null check(payment_method in ('cash','card','other')),notes text not null default '' check(length(notes)<=1000),created_at timestamptz not null default now()
);
create or replace function public.validate_essentials_link() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_table_name='bookings' then
  if new.segment_id is not null and not exists(select 1 from public.trip_segments s where s.id=new.segment_id and s.trip_id=new.trip_id) then raise exception 'Segment must belong to the same trip';end if;
 elsif tg_table_name='packing_items' then
  if not exists(select 1 from public.packing_lists l where l.id=new.list_id and l.trip_id=new.trip_id) then raise exception 'Packing list must belong to the same trip';end if;
 elsif tg_table_name='budget_allocations' then
  if new.destination_id is not null and not exists(select 1 from public.trip_segments s where s.id=new.destination_id and s.kind='destination' and s.trip_id=new.trip_id) then raise exception 'Destination must belong to the same trip';end if;
  if new.day is not null and not exists(select 1 from public.trips t where t.id=new.trip_id and new.day between t.start_date and t.end_date) then raise exception 'Allocation day must be within trip dates';end if;
 end if;
 return new;
end $$;
do $$ declare tab text;begin
 foreach tab in array array['bookings','prep_tasks','packing_lists','packing_items','budget_settings','budget_allocations','expenses'] loop
  execute format('alter table public.%I enable row level security',tab);
  if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename=tab and policyname='owner_only') then
  execute format('create policy owner_only on public.%I for all to authenticated using(exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=(select auth.uid()))) with check(exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=(select auth.uid())))',tab);end if;
  execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
  if tab<>'budget_settings' then execute format('create index if not exists %I on public.%I(trip_id)',tab||'_trip_idx',tab);end if;
 end loop;
 foreach tab in array array['bookings','packing_items','budget_allocations'] loop
  execute format('create or replace trigger essentials_link before insert or update on public.%I for each row execute function public.validate_essentials_link()',tab);
 end loop;
end $$;
alter table public.packing_templates enable row level security;
do $$ begin if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='packing_templates' and policyname='templates_private') then create policy templates_private on public.packing_templates for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));end if;end $$;
grant select,insert,update,delete on public.packing_templates to authenticated;
-- Applying a template is an explicit action and one transaction.
create or replace function public.apply_packing_template(target_list uuid, template uuid) returns void language plpgsql security invoker set search_path='' as $$
declare trip uuid; items jsonb; item jsonb;
begin
 select trip_id into trip from public.packing_lists where id=target_list;
 select t.items into items from public.packing_templates t where t.id=template;
 if trip is null or items is null then raise exception 'List or template unavailable';end if;
 for item in select value from jsonb_array_elements(items) loop
 insert into public.packing_items(trip_id,list_id,title,category,quantity) values(trip,target_list,item->>'title',item->>'category',(item->>'quantity')::integer);
 end loop;
end $$;
revoke all on function public.apply_packing_template(uuid,uuid) from public;
grant execute on function public.apply_packing_template(uuid,uuid) to authenticated;
create or replace function public.preserve_trip_id() returns trigger language plpgsql set search_path='' as $$begin if new.trip_id<>old.trip_id then raise exception 'Records cannot be moved to a different trip';end if;return new;end $$;
do $$ declare tab text;begin foreach tab in array array['trip_segments','bookings','prep_tasks','packing_lists','packing_items','budget_allocations','expenses'] loop
 execute format('create or replace trigger preserve_trip before update on public.%I for each row execute function public.preserve_trip_id()',tab);end loop;end $$;
create or replace function public.validate_trip_dates() returns trigger language plpgsql set search_path='' as $$ begin
 if exists(select 1 from public.trip_segments s where s.trip_id=new.id and (s.start_date<new.start_date or s.end_date>new.end_date)) then raise exception 'Move segment dates before shortening trip';end if;
 if exists(select 1 from public.budget_allocations a where a.trip_id=new.id and a.day is not null and (a.day<new.start_date or a.day>new.end_date)) then raise exception 'Move allocation dates before shortening trip';end if;
 return new;end $$;
create or replace trigger booking_updated before update on public.bookings for each row execute function public.touch_updated_at();
commit;
