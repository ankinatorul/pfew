begin;
create table if not exists public.trip_onboarding (
 trip_id uuid primary key references public.trips on delete cascade,
 owner_id uuid not null references auth.users on delete cascade,
 request_id uuid not null,
 preferences jsonb not null default '{}' check(jsonb_typeof(preferences)='object' and length(preferences::text)<=100000),
 unique(owner_id,request_id)
);
alter table public.trip_onboarding enable row level security;
drop policy if exists onboarding_owner on public.trip_onboarding;
create policy onboarding_owner on public.trip_onboarding for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=auth.uid()));
grant select,insert,update on public.trip_onboarding to authenticated;
create or replace function public.reserve_onboarding_ai() returns uuid language plpgsql security definer set search_path='' as $$
declare settings public.service_budget_settings;used integer;requests integer;result uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(77331001);
 select * into settings from public.service_budget_settings where id=true;
 if settings.id is null then raise exception 'Service limits unavailable';end if;
 select count(*) into requests from public.service_usage where actor_id=auth.uid() and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if requests>=settings.daily_user_requests then raise exception 'Daily request limit reached';end if;
 select coalesce(sum(estimated_cents),0) into used from public.service_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if used+settings.ai_request_cents>settings.monthly_limit_cents then raise exception 'Monthly estimated service budget reached';end if;
 insert into public.service_usage(actor_id,service,estimated_cents) values(auth.uid(),'ai',settings.ai_request_cents) returning id into result;
 return result;
end $$;
create or replace function public.create_onboarding_trip(request_key uuid,trip_data jsonb,destinations jsonb,approved_bookings jsonb,preferences jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;item jsonb;b public.bookings;
begin
 if auth.uid() is null or request_key is null then raise exception 'Authentication required';end if;
 if jsonb_typeof(approved_bookings)<>'array' or jsonb_array_length(approved_bookings)>20 then raise exception 'Invalid bookings';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_key::text,7740));
 select o.trip_id into result from public.trip_onboarding o where o.owner_id=auth.uid() and o.request_id=request_key;
 if result is not null then return result;end if;
 result=public.create_trip_with_destinations(trip_data,destinations);
 for item in select * from jsonb_array_elements(approved_bookings) loop
  b=jsonb_populate_record(null::public.bookings,item);
  insert into public.bookings(trip_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,import_key,import_method,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude)
  values(result,b.title,b.category,coalesce(b.provider,''),coalesce(b.reference,''),b.start_date,b.end_date,coalesce(b.local_time,''),b.timezone,coalesce(b.end_local_time,''),coalesce(b.end_timezone,''),coalesce(b.origin,''),coalesce(b.destination,''),'','',b.price,b.paid_amount,b.currency,'unknown',coalesce(b.verification,'unverified'),b.import_key,coalesce(b.import_method,'manual'),b.location_id,b.location_label,b.latitude,b.longitude,b.end_location_id,b.end_location_label,b.end_latitude,b.end_longitude);
 end loop;
 insert into public.trip_onboarding(trip_id,owner_id,request_id,preferences) values(result,auth.uid(),request_key,preferences);
 return result;
end $$;
create or replace function public.complete_onboarding_draft(target uuid,draft_key uuid,booking_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare prefs jsonb;source jsonb;b public.bookings;result uuid;
begin
 select preferences into prefs from public.trip_onboarding where trip_id=target and owner_id=auth.uid() for update;
 if prefs is null then raise exception 'Private draft unavailable';end if;
 select id into result from public.bookings where trip_id=target and import_key=draft_key;
 if result is not null then return result;end if;
 select value into source from jsonb_array_elements(coalesce(prefs->'pending_bookings','[]')) where value->>'id'=draft_key::text;
 if source is null then raise exception 'Draft unavailable';end if;
 b=jsonb_populate_record(null::public.bookings,booking_data);
 insert into public.bookings(trip_id,segment_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,import_key,import_method,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude)
 values(target,b.segment_id,b.title,b.category,b.provider,b.reference,b.start_date,b.end_date,b.local_time,b.timezone,b.end_local_time,b.end_timezone,b.origin,b.destination,b.travelers,b.notes,b.price,b.paid_amount,b.currency,b.payment_status,b.verification,draft_key,source->>'method',b.location_id,b.location_label,b.latitude,b.longitude,b.end_location_id,b.end_location_label,b.end_latitude,b.end_longitude) returning id into result;
 update public.trip_onboarding set preferences=jsonb_set(prefs,'{pending_bookings}',coalesce((select jsonb_agg(value) from jsonb_array_elements(prefs->'pending_bookings') where value->>'id'<>draft_key::text),'[]')) where trip_id=target and owner_id=auth.uid();
 return result;
end $$;
revoke all on function public.complete_onboarding_draft(uuid,uuid,jsonb) from public;
grant execute on function public.complete_onboarding_draft(uuid,uuid,jsonb) to authenticated;
revoke all on function public.reserve_onboarding_ai(),public.create_onboarding_trip(uuid,jsonb,jsonb,jsonb,jsonb) from public;
grant execute on function public.reserve_onboarding_ai(),public.create_onboarding_trip(uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;
commit;
