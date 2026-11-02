begin;
-- Boolean-only helpers avoid recursive policies; Phase 4 extends these with membership.
create or replace function public.can_read_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.trips t where t.id=target and t.owner_id=auth.uid())$$;
create or replace function public.can_edit_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select public.can_read_trip(target)$$;
revoke all on function public.can_read_trip(uuid),public.can_edit_trip(uuid) from public;
grant execute on function public.can_read_trip(uuid),public.can_edit_trip(uuid) to authenticated;
alter table public.trip_segments add column if not exists google_place_id text,add column if not exists duration_minutes integer check(duration_minutes between 1 and 1440);
create table if not exists public.trip_check_runs(trip_id uuid primary key references public.trips on delete cascade,checked_at timestamptz not null default now(),finding_count integer not null check(finding_count between 0 and 200));
create table if not exists public.saved_places(
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,
 title text not null check(length(title) between 1 and 200),notes text not null default '' check(length(notes)<=2000),category text not null default 'other' check(category in ('food','activity','stay','transport','other')),
 source text not null check(source in ('city','google')),location_id text,latitude double precision check(latitude between -90 and 90),longitude double precision check(longitude between -180 and 180),google_place_id text,
 created_at timestamptz not null default now(),check((source='city' and location_id is not null and latitude is not null and longitude is not null and google_place_id is null) or (source='google' and google_place_id is not null and latitude is null and longitude is null))
);
create table if not exists public.trip_check_findings(
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,
 fingerprint text not null check(length(fingerprint)=64),kind text not null,priority text not null check(priority in ('info','attention')),title text not null,observation text not null,uncertainty text not null,action_view text not null check(action_view in ('itinerary','destinations','stays','transport','bookings','prep','budget')),
 active boolean not null default true,checked_at timestamptz not null default now(),unique(trip_id,fingerprint),unique(id,trip_id)
);
create table if not exists public.finding_decisions(
 finding_id uuid primary key,trip_id uuid not null references public.trips on delete cascade,decision text not null check(decision in ('already_arranged','not_needed','dismissed','remind_later')),remind_after timestamptz,updated_at timestamptz not null default now(),foreign key(finding_id,trip_id) references public.trip_check_findings(id,trip_id) on delete cascade,check(decision<>'remind_later' or remind_after is not null)
);
create table if not exists public.ai_suggestions(
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,title text not null check(length(title) between 1 and 200),note text not null check(length(note)<=2000),category text not null,source text not null check(source in ('mock','ai')),accepted_segment_id uuid references public.trip_segments on delete set null,dismissed boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists public.service_budget_settings(id boolean primary key default true check(id),monthly_limit_cents integer not null default 500 check(monthly_limit_cents between 0 and 1000000),daily_user_requests integer not null default 30 check(daily_user_requests between 0 and 1000),ai_request_cents integer not null default 5 check(ai_request_cents between 1 and 10000),places_request_cents integer not null default 5 check(places_request_cents between 1 and 10000));
insert into public.service_budget_settings(id) values(true) on conflict do nothing;
create table if not exists public.service_usage(id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users on delete set null,trip_id uuid references public.trips on delete set null,service text not null check(service in ('ai','places','mock')),estimated_cents integer not null check(estimated_cents>=0),outcome text not null default 'reserved' check(outcome in ('reserved','succeeded','failed')),created_at timestamptz not null default now());
create index if not exists service_usage_window on public.service_usage(created_at,actor_id);
do $$ declare tab text;begin
 foreach tab in array array['saved_places','trip_check_findings','ai_suggestions','finding_decisions','trip_check_runs'] loop
 execute format('alter table public.%I enable row level security',tab);
 if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename=tab and policyname='intelligence_read') then
 execute format('create policy intelligence_read on public.%I for select to authenticated using(public.can_read_trip(trip_id))',tab);
 execute format('create policy intelligence_write on public.%I for all to authenticated using(public.can_edit_trip(trip_id)) with check(public.can_edit_trip(trip_id))',tab);end if;
 execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
 execute format('create index if not exists %I on public.%I(trip_id)',tab||'_trip_idx',tab);
 execute format('create or replace trigger preserve_trip before update on public.%I for each row execute function public.preserve_trip_id()',tab);
 end loop;
end $$;
alter table public.service_usage enable row level security;
alter table public.service_budget_settings enable row level security;
do $$ begin if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='service_usage' and policyname='usage_private') then create policy usage_private on public.service_usage for select to authenticated using(actor_id=auth.uid());end if;end $$;
grant select on public.service_usage to authenticated;
create or replace function public.reserve_service(target uuid,kind text) returns uuid language plpgsql security definer set search_path='' as $$
declare settings public.service_budget_settings;cost integer;used integer;requests integer;result uuid;
begin
 if auth.uid() is null or not public.can_edit_trip(target) then raise exception 'Trip editing permission required';end if;
 if kind not in ('ai','places','mock') then raise exception 'Unsupported service';end if;
 perform pg_advisory_xact_lock(77331001);
 select * into settings from public.service_budget_settings where id=true;
 select count(*) into requests from public.service_usage where actor_id=auth.uid() and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if requests>=settings.daily_user_requests then raise exception 'Daily request limit reached';end if;
 cost=case kind when 'mock' then 0 when 'ai' then settings.ai_request_cents else settings.places_request_cents end;
 select coalesce(sum(estimated_cents),0) into used from public.service_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if cost>0 and used+cost>settings.monthly_limit_cents then raise exception 'Monthly estimated service budget reached';end if;
 insert into public.service_usage(actor_id,trip_id,service,estimated_cents) values(auth.uid(),target,kind,cost) returning id into result;return result;
end $$;
create or replace function public.finish_service(reservation uuid,succeeded boolean) returns void language plpgsql security definer set search_path='' as $$begin update public.service_usage set outcome=case when succeeded then 'succeeded' else 'failed' end where id=reservation and actor_id=auth.uid() and outcome='reserved';end $$;
create or replace function public.service_budget_status() returns jsonb language plpgsql security definer set search_path='' as $$declare used integer;settings public.service_budget_settings;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into settings from public.service_budget_settings where id=true;
 select coalesce(sum(estimated_cents),0) into used from public.service_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 return jsonb_build_object('estimated_cents',used,'monthly_limit_cents',settings.monthly_limit_cents,'daily_user_requests',settings.daily_user_requests);
end $$;
create or replace function public.replace_trip_check(target uuid,findings jsonb) returns void language plpgsql security invoker set search_path='' as $$declare finding jsonb;begin
 if not public.can_edit_trip(target) then raise exception 'Trip editing permission required';end if;
 if jsonb_typeof(findings)<>'array' or jsonb_array_length(findings)>200 then raise exception 'Invalid findings';end if;
 insert into public.trip_check_runs(trip_id,finding_count) values(target,jsonb_array_length(findings)) on conflict(trip_id) do update set checked_at=now(),finding_count=excluded.finding_count;
 update public.trip_check_findings set active=false where trip_id=target;
 for finding in select value from jsonb_array_elements(findings) loop
 insert into public.trip_check_findings(trip_id,fingerprint,kind,priority,title,observation,uncertainty,action_view,active,checked_at)
 values(target,finding->>'fingerprint',finding->>'kind',finding->>'priority',finding->>'title',finding->>'observation',finding->>'uncertainty',finding->>'action_view',true,now())
 on conflict(trip_id,fingerprint) do update set active=true,checked_at=now(),title=excluded.title,observation=excluded.observation,uncertainty=excluded.uncertainty;end loop;
end $$;
create or replace function public.accept_ai_idea(suggestion uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare idea public.ai_suggestions;trip public.trips;result uuid;begin
 select * into idea from public.ai_suggestions where id=suggestion for update;
 if idea.id is null or not public.can_edit_trip(idea.trip_id) then raise exception 'Suggestion unavailable';end if;
 if idea.accepted_segment_id is not null then return idea.accepted_segment_id;end if;
 select * into trip from public.trips where id=idea.trip_id;
 insert into public.trip_segments(trip_id,kind,title,start_date,end_date,timezone,status,notes) values(trip.id,'activity',idea.title,trip.start_date,trip.start_date,trip.timezone,'idea',idea.note) returning id into result;
 update public.ai_suggestions set accepted_segment_id=result where id=idea.id;return result;
end $$;
revoke all on function public.reserve_service(uuid,text),public.finish_service(uuid,boolean),public.service_budget_status(),public.replace_trip_check(uuid,jsonb),public.accept_ai_idea(uuid) from public;
grant execute on function public.reserve_service(uuid,text),public.finish_service(uuid,boolean),public.service_budget_status(),public.replace_trip_check(uuid,jsonb),public.accept_ai_idea(uuid) to authenticated;
commit;
