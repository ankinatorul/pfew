-- Pfew upgrade for an existing project with migrations 001-004.
-- Generated from migrations 005-008; preserves existing data.
begin;

-- 005_automatic_locations.sql
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

-- 006_trip_intelligence.sql
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

-- 007_collaborative_trips.sql
create table if not exists public.trip_members(id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,user_id uuid not null references auth.users on delete cascade,role text not null check(role in ('editor','viewer')),created_at timestamptz not null default now(),unique(trip_id,user_id));
create index if not exists trip_members_user on public.trip_members(user_id,trip_id);
create table if not exists public.trip_invitations(id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,email text not null check(length(email) between 3 and 254),role text not null check(role in ('editor','viewer')),token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,accepted_at timestamptz,accepted_by uuid references auth.users on delete set null,created_at timestamptz not null default now());
create table if not exists public.audit_events(id uuid primary key default gen_random_uuid(),trip_id uuid not null,actor_id uuid references auth.users on delete set null,entity_table text not null,entity_id uuid not null,action text not null check(action in ('INSERT','UPDATE','DELETE')),created_at timestamptz not null default now());
create index if not exists audit_trip_created on public.audit_events(trip_id,created_at desc);
create or replace function public.owns_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.trips t where t.id=target and t.owner_id=auth.uid())$$;
create or replace function public.can_read_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select public.owns_trip(target) or exists(select 1 from public.trip_members m where m.trip_id=target and m.user_id=auth.uid())$$;
create or replace function public.can_edit_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select public.owns_trip(target) or exists(select 1 from public.trip_members m where m.trip_id=target and m.user_id=auth.uid() and m.role='editor')$$;
revoke all on function public.owns_trip(uuid),public.can_read_trip(uuid),public.can_edit_trip(uuid) from public;
grant execute on function public.owns_trip(uuid),public.can_read_trip(uuid),public.can_edit_trip(uuid) to authenticated;
alter table public.trip_members enable row level security;alter table public.trip_invitations enable row level security;alter table public.audit_events enable row level security;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='trip_members' and policyname='members_read') then
 create policy members_read on public.trip_members for select to authenticated using(public.can_read_trip(trip_id));
 create policy members_manage on public.trip_members for all to authenticated using(public.owns_trip(trip_id)) with check(public.owns_trip(trip_id));
 create policy invitations_private on public.trip_invitations for all to authenticated using(public.owns_trip(trip_id)) with check(public.owns_trip(trip_id));
 create policy audit_read on public.audit_events for select to authenticated using(public.can_read_trip(trip_id));end if;
end $$;
grant select,insert,update,delete on public.trip_members,public.trip_invitations to authenticated;grant select on public.audit_events to authenticated;
drop policy if exists trips_private on public.trips;
drop policy if exists trip_read on public.trips;drop policy if exists trip_insert on public.trips;drop policy if exists trip_update on public.trips;drop policy if exists trip_delete on public.trips;
create policy trip_read on public.trips for select to authenticated using(owner_id=auth.uid() or public.can_read_trip(id));
create policy trip_insert on public.trips for insert to authenticated with check(owner_id=auth.uid());
create policy trip_update on public.trips for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy trip_delete on public.trips for delete to authenticated using(owner_id=auth.uid());
do $$ declare tab text;begin
 foreach tab in array array['trip_segments','trip_hub_preferences','bookings','prep_tasks','packing_lists','packing_items','budget_settings','budget_allocations','expenses'] loop
 execute format('drop policy if exists segments_private on public.%I',tab);execute format('drop policy if exists preferences_private on public.%I',tab);execute format('drop policy if exists owner_only on public.%I',tab);
 execute format('drop policy if exists shared_read on public.%I',tab);execute format('drop policy if exists shared_edit on public.%I',tab);
 execute format('create policy shared_read on public.%I for select to authenticated using(public.can_read_trip(trip_id))',tab);
 execute format('create policy shared_edit on public.%I for all to authenticated using(public.can_edit_trip(trip_id)) with check(public.can_edit_trip(trip_id))',tab);
 end loop;
end $$;
create or replace function public.preserve_trip_owner() returns trigger language plpgsql set search_path='' as $$begin if new.owner_id<>old.owner_id then raise exception 'Trip ownership cannot be changed directly';end if;return new;end $$;
create or replace trigger preserve_owner before update on public.trips for each row execute function public.preserve_trip_owner();
-- Synchronizing a reference time zone is the one narrow parent update editors may cause.
create or replace function public.sync_trip_timezone() returns trigger language plpgsql security definer set search_path='' as $$declare target uuid;zone text;begin
 target=case when tg_op='DELETE' then old.trip_id else new.trip_id end;
 if auth.uid() is not null and not public.can_edit_trip(target) then return null;end if;
 select s.timezone into zone from public.trip_segments s where s.trip_id=target and s.kind='destination' and s.status<>'idea' order by s.start_date,s.position,s.id limit 1;
 if zone is not null then update public.trips set timezone=zone where id=target and timezone<>zone;end if;
 return null;end $$;
create or replace function public.preview_trip_invitation(invite_hash text) returns jsonb language plpgsql security definer set search_path='' as $$declare invitation public.trip_invitations;account_email text;trip_name text;begin
 select lower(u.email) into account_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if account_email is null then return null;end if;
 select * into invitation from public.trip_invitations i where i.token_hash=invite_hash and lower(i.email)=account_email and i.expires_at>now() and (i.accepted_at is null or i.accepted_by=auth.uid());
 if invitation.id is null then return null;end if;
 select name into trip_name from public.trips where id=invitation.trip_id;
 return jsonb_build_object('trip_name',trip_name,'role',invitation.role,'expires_at',invitation.expires_at,'accepted',invitation.accepted_at is not null);
end $$;
create or replace function public.accept_trip_invitation(invite_hash text) returns uuid language plpgsql security definer set search_path='' as $$declare invitation public.trip_invitations;account_email text;begin
 select lower(u.email) into account_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if account_email is null then raise exception 'Verified account required';end if;
 select * into invitation from public.trip_invitations i where i.token_hash=invite_hash and lower(i.email)=account_email for update;
 if invitation.id is null or invitation.expires_at<=now() then raise exception 'Invitation unavailable or expired';end if;
 if invitation.accepted_at is not null then if invitation.accepted_by=auth.uid() then return invitation.trip_id;else raise exception 'Invitation already used';end if;end if;
 if not public.owns_trip(invitation.trip_id) then insert into public.trip_members(trip_id,user_id,role) values(invitation.trip_id,auth.uid(),invitation.role) on conflict(trip_id,user_id) do update set role=excluded.role;end if;
 update public.trip_invitations set accepted_at=now(),accepted_by=auth.uid() where id=invitation.id;
 return invitation.trip_id;
end $$;
revoke all on function public.preview_trip_invitation(text),public.accept_trip_invitation(text) from public;
grant execute on function public.preview_trip_invitation(text),public.accept_trip_invitation(text) to authenticated;
create or replace function public.record_trip_audit() returns trigger language plpgsql security definer set search_path='' as $$declare item jsonb;target uuid;entity uuid;begin
 item=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 target=case when tg_table_name='trips' then (item->>'id')::uuid else (item->>'trip_id')::uuid end;
 entity=coalesce(item->>'id',item->>'finding_id',item->>'trip_id')::uuid;
 insert into public.audit_events(trip_id,actor_id,entity_table,entity_id,action) values(target,auth.uid(),tg_table_name,entity,tg_op);return null;
end $$;
do $$ declare tab text;begin
 foreach tab in array array['trips','trip_members','trip_invitations','trip_segments','trip_hub_preferences','bookings','prep_tasks','packing_lists','packing_items','budget_settings','budget_allocations','expenses','saved_places','finding_decisions'] loop
 execute format('create or replace trigger record_audit after insert or update or delete on public.%I for each row execute function public.record_trip_audit()',tab);end loop;
end $$;
-- This returns only a boolean during destructive actions, never document contents or names.
create or replace function public.has_other_private_files(target uuid,booking uuid default null) returns boolean language plpgsql security definer set search_path='' as $$begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 return exists(select 1 from public.booking_attachments a where a.trip_id=target and (booking is null or a.booking_id=booking) and a.owner_id<>auth.uid());end $$;
revoke all on function public.has_other_private_files(uuid,uuid) from public;grant execute on function public.has_other_private_files(uuid,uuid) to authenticated;
create or replace function public.set_trip_budget(target uuid,total numeric,tier text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 if total<0 or total>9999999999 or tier not in ('Budget','Comfort','Luxury') then raise exception 'Invalid budget';end if;
 update public.trips set budget=total,style=tier where id=target;
end $$;
revoke all on function public.set_trip_budget(uuid,numeric,text) from public;grant execute on function public.set_trip_budget(uuid,numeric,text) to authenticated;

-- 008_private_upload_reservations.sql
-- Preserve existing documents as ready; new uploads reserve metadata before uploading.
alter table public.booking_attachments add column if not exists state text not null default 'ready' check(state in ('pending','ready'));
alter table public.booking_attachments alter column state set default 'pending';
drop policy if exists attachments_owner on public.booking_attachments;
drop policy if exists documents_private on public.booking_attachments;drop policy if exists documents_insert on public.booking_attachments;drop policy if exists documents_update on public.booking_attachments;
create policy documents_private on public.booking_attachments for select to authenticated using(owner_id=auth.uid());
create policy documents_insert on public.booking_attachments for insert to authenticated with check(owner_id=auth.uid() and public.can_edit_trip(trip_id) and exists(select 1 from public.bookings b where b.id=booking_id and b.trip_id=booking_attachments.trip_id));
create policy documents_update on public.booking_attachments for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists documents_delete on public.booking_attachments;
create policy documents_delete on public.booking_attachments for delete to authenticated using(owner_id=auth.uid());
grant update on public.booking_attachments to authenticated;
create or replace function public.validate_private_upload() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then
 if auth.uid() is null or new.owner_id<>auth.uid() or not public.can_edit_trip(new.trip_id) then raise exception 'Editing permission required';end if;
 if not exists(select 1 from public.bookings b where b.id=new.booking_id and b.trip_id=new.trip_id) then raise exception 'Booking unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(new.booking_id::text,7733));
 if (select count(*) from public.booking_attachments a where a.booking_id=new.booking_id)>=10 then raise exception 'Booking document limit reached';end if;
 elsif new.id<>old.id or new.owner_id<>old.owner_id or new.path<>old.path or new.trip_id<>old.trip_id or new.booking_id<>old.booking_id then raise exception 'Document ownership and storage path cannot be changed';end if;
 if new.state='ready' and not exists(select 1 from storage.objects o where o.bucket_id='booking-files' and o.name=new.path) then raise exception 'Upload is not complete';end if;
 return new;
end $$;
create or replace trigger private_upload before insert or update on public.booking_attachments for each row execute function public.validate_private_upload();
create or replace function public.can_access_booking_file(object_name text) returns boolean language sql stable security invoker set search_path='' as $$
 select split_part(object_name,'/',1)=auth.uid()::text and exists(select 1 from public.booking_attachments a where a.path=object_name and a.owner_id=auth.uid())
$$;
drop policy if exists pfew_booking_files_insert on storage.objects;
create policy pfew_booking_files_insert on storage.objects for insert to authenticated with check(bucket_id='booking-files' and public.can_access_booking_file(name) and exists(select 1 from public.booking_attachments a where a.path=name and a.state='pending' and public.can_edit_trip(a.trip_id)));
-- Existing read/delete policies use the helper above. Private files remain manageable
-- by their uploader even after membership is revoked, through the personal account page.
-- Reject destructive cascades until stored files and metadata have been removed.
create or replace function public.guard_private_document_deletion() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='booking_attachments' then
   if exists(select 1 from storage.objects o where o.bucket_id='booking-files' and o.name=old.path) then raise exception 'Remove the stored private document before its metadata';end if;
 elsif tg_table_name='bookings' then
   if exists(select 1 from public.booking_attachments a where a.booking_id=old.id) then raise exception 'Remove private documents before deleting this booking';end if;
 else
   if exists(select 1 from public.booking_attachments a where a.trip_id=old.id) then raise exception 'Remove private documents before deleting this trip';end if;
 end if;return old;
end $$;
create or replace trigger guard_private_files before delete on public.trips for each row execute function public.guard_private_document_deletion();
create or replace trigger guard_private_files before delete on public.bookings for each row execute function public.guard_private_document_deletion();
create or replace trigger guard_private_files before delete on public.booking_attachments for each row execute function public.guard_private_document_deletion();

commit;
