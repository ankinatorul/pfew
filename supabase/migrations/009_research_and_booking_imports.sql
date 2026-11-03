begin;
alter table public.bookings add column if not exists import_key uuid,add column if not exists import_method text not null default 'manual' check(import_method in ('manual','text','ai'));
create unique index if not exists booking_import_once on public.bookings(trip_id,import_key) where import_key is not null;
create table if not exists public.research_notes(
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,destination_id uuid references public.trip_segments on delete set null,
 destination_label text not null check(length(destination_label) between 1 and 200),source_id text not null check(length(source_id) between 1 and 50),source_name text not null check(length(source_name) between 1 and 200),source_url text not null check(source_url ~ '^https://'),
 retrieved_at timestamptz not null,reviewed_at timestamptz not null,title text not null check(length(title) between 1 and 160),source_excerpt text not null check(length(source_excerpt) between 15 and 1200),note text not null default '' check(length(note)<=1500),
 context jsonb not null check(jsonb_typeof(context)='object' and context ?& array['nationality','document','purpose','travel_start','travel_end']),created_at timestamptz not null default now()
);
alter table public.research_notes drop constraint if exists research_context_valid;
alter table public.research_notes add constraint research_context_valid check(
 length(context::text)<=2000 and jsonb_typeof(context->'nationality')='string' and length(context->>'nationality') between 2 and 80
 and context->>'document' in ('ordinary passport','identity card','other travel document') and context->>'purpose' in ('tourism','business','transit','other')
 and jsonb_typeof(context->'travel_start')='string' and jsonb_typeof(context->'travel_end')='string' and context->>'travel_start' ~ '^\d{4}-\d{2}-\d{2}$' and context->>'travel_end' ~ '^\d{4}-\d{2}-\d{2}$' and context->>'travel_end'>=context->>'travel_start'
);
create index if not exists research_trip on public.research_notes(trip_id);
alter table public.research_notes enable row level security;
drop policy if exists research_read on public.research_notes;drop policy if exists research_edit on public.research_notes;
create policy research_read on public.research_notes for select to authenticated using(public.can_read_trip(trip_id));
create policy research_edit on public.research_notes for all to authenticated using(public.can_edit_trip(trip_id)) with check(public.can_edit_trip(trip_id));
grant select,insert,update,delete on public.research_notes to authenticated;
create or replace trigger preserve_trip before update on public.research_notes for each row execute function public.preserve_trip_id();
create or replace function public.validate_research_destination() returns trigger language plpgsql set search_path='' as $$begin
 if new.destination_id is not null and not exists(select 1 from public.trip_segments s where s.id=new.destination_id and s.trip_id=new.trip_id and s.kind='destination') then raise exception 'Destination must belong to the same trip';end if;return new;
end $$;
create or replace trigger research_destination before insert or update on public.research_notes for each row execute function public.validate_research_destination();
create or replace trigger record_audit after insert or update or delete on public.research_notes for each row execute function public.record_trip_audit();
alter table public.prep_tasks add column if not exists research_note_id uuid references public.research_notes on delete set null;
create unique index if not exists prep_research_once on public.prep_tasks(research_note_id) where research_note_id is not null;
create or replace function public.validate_prep_research_link() returns trigger language plpgsql set search_path='' as $$begin
 if new.research_note_id is not null and not exists(select 1 from public.research_notes r where r.id=new.research_note_id and r.trip_id=new.trip_id) then raise exception 'Research note must belong to the same trip';end if;return new;
end $$;
create or replace trigger prep_research_link before insert or update on public.prep_tasks for each row execute function public.validate_prep_research_link();
-- Public-source previews have no paid provider charge, but consume the same daily limit.
alter table public.service_usage drop constraint if exists service_usage_service_check;
alter table public.service_usage add constraint service_usage_service_check check(service in ('ai','places','mock','research'));
create or replace function public.reserve_service(target uuid,kind text) returns uuid language plpgsql security definer set search_path='' as $$
declare settings public.service_budget_settings;cost integer;used integer;requests integer;result uuid;
begin
 if auth.uid() is null or not public.can_edit_trip(target) then raise exception 'Trip editing permission required';end if;
 if kind not in ('ai','places','mock','research') then raise exception 'Unsupported service';end if;
 perform pg_advisory_xact_lock(77331001);
 select * into settings from public.service_budget_settings where id=true;
 select count(*) into requests from public.service_usage where actor_id=auth.uid() and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if requests>=settings.daily_user_requests then raise exception 'Daily request limit reached';end if;
 cost=case kind when 'ai' then settings.ai_request_cents when 'places' then settings.places_request_cents else 0 end;
 select coalesce(sum(estimated_cents),0) into used from public.service_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if cost>0 and used+cost>settings.monthly_limit_cents then raise exception 'Monthly estimated service budget reached';end if;
 insert into public.service_usage(actor_id,trip_id,service,estimated_cents) values(auth.uid(),target,kind,cost) returning id into result;return result;
end $$;
create or replace function public.save_reviewed_booking(target uuid,import_id uuid,method text,approved boolean,booking_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare existing uuid;b public.bookings;result uuid;
begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 if approved is distinct from true or method not in ('text','ai') or import_id is null then raise exception 'Review and approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||import_id::text,7739));
 select id into existing from public.bookings where trip_id=target and import_key=import_id;
 if existing is not null then return existing;end if;
 b=jsonb_populate_record(null::public.bookings,booking_data);
 insert into public.bookings(trip_id,segment_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude,import_key,import_method)
 values(target,b.segment_id,b.title,b.category,b.provider,b.reference,b.start_date,b.end_date,b.local_time,b.timezone,b.end_local_time,b.end_timezone,b.origin,b.destination,b.travelers,b.notes,b.price,b.paid_amount,b.currency,b.payment_status,'user confirmed',b.location_id,b.location_label,b.latitude,b.longitude,b.end_location_id,b.end_location_label,b.end_latitude,b.end_longitude,import_id,method) returning id into result;
 return result;
end $$;
create or replace function public.research_note_to_prep(target uuid,target_trip uuid,task_title text,due date default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare record public.research_notes;result uuid;
begin
 select * into record from public.research_notes where id=target and trip_id=target_trip for update;
 if record.id is null or not public.can_edit_trip(record.trip_id) then raise exception 'Editing permission required';end if;
 if length(trim(task_title)) not between 1 and 200 then raise exception 'Task title required';end if;
 select id into result from public.prep_tasks where research_note_id=target;if result is not null then return result;end if;
 insert into public.prep_tasks(trip_id,title,category,due_date,research_note_id) values(record.trip_id,trim(task_title),'Entry requirements',due,record.id) returning id into result;return result;
end $$;
revoke all on function public.save_reviewed_booking(uuid,uuid,text,boolean,jsonb),public.research_note_to_prep(uuid,uuid,text,date) from public;
grant execute on function public.save_reviewed_booking(uuid,uuid,text,boolean,jsonb),public.research_note_to_prep(uuid,uuid,text,date) to authenticated;
commit;
