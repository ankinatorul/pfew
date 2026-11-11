-- LOCAL PREPARATION ONLY. Developer review, backup, and 010/011 are required.
-- Formalize the already observed owner-private onboarding metadata store.
-- Normal bookings retain all required fields and date/link constraints.
begin;
create table if not exists public.trip_onboarding(
 trip_id uuid primary key references public.trips on delete cascade,
 owner_id uuid not null references auth.users on delete cascade,
 request_id uuid not null,preferences jsonb not null default '{}'
 check(jsonb_typeof(preferences)='object' and length(preferences::text)<=100000),
 unique(owner_id,request_id)
);
alter table public.trip_onboarding add column if not exists updated_at timestamptz not null default now();
alter table public.trip_onboarding enable row level security;
drop policy if exists onboarding_owner on public.trip_onboarding;
create policy onboarding_owner on public.trip_onboarding for all to authenticated
 using(owner_id=auth.uid()) with check(owner_id=auth.uid() and public.owns_trip(trip_id));
grant select,insert,update,delete on public.trip_onboarding to authenticated;
create or replace trigger onboarding_updated before update on public.trip_onboarding for each row execute function public.touch_updated_at();
create or replace function public.preserve_onboarding_owner() returns trigger language plpgsql set search_path='' as $$begin
 if new.owner_id<>old.owner_id or new.trip_id<>old.trip_id or new.request_id<>old.request_id then raise exception 'Booking draft identity cannot be changed';end if;return new;
end $$;
create or replace trigger preserve_onboarding_identity before update on public.trip_onboarding for each row execute function public.preserve_onboarding_owner();

alter table public.bookings add column if not exists reservation_status text not null default 'unknown'
 check(reservation_status in ('unknown','confirmed','pending','cancelled'));
-- Existing verification is review of details, NOT provider reservation status.

alter table public.booking_attachments alter column booking_id drop not null;
alter table public.booking_attachments add column if not exists intake_id uuid;
alter table public.booking_attachments add column if not exists content_sha256 text check(content_sha256 ~ '^[a-f0-9]{64}$');
-- Replace only the original path check; keep all other document constraints.
do $$ declare c record;begin
 for c in select conname from pg_catalog.pg_constraint where conrelid='public.booking_attachments'::regclass and contype='c' and pg_catalog.pg_get_constraintdef(oid) like '%path =%' loop
  execute format('alter table public.booking_attachments drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.booking_attachments drop constraint if exists attachment_collection_path;
alter table public.booking_attachments add constraint attachment_collection_path check(
 (booking_id is not null or intake_id is not null)
 and path=owner_id::text||'/'||trip_id::text||'/'||coalesce(intake_id,booking_id)::text||'/'||id::text
);
create index if not exists attachment_intake on public.booking_attachments(trip_id,intake_id) where intake_id is not null;

create or replace function public.save_booking_intake(target uuid,item_id uuid,expected_revision integer,entry jsonb,remove_item boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare prefs jsonb;items jsonb;old_entry jsonb;payload jsonb;result jsonb;begin
 if auth.uid() is null or not public.owns_trip(target) then raise exception 'Trip owner access required';end if;
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid booking revision';end if;
 insert into public.trip_onboarding(trip_id,owner_id,request_id) values(target,auth.uid(),target) on conflict(trip_id) do nothing;
 select preferences into prefs from public.trip_onboarding where trip_id=target and owner_id=auth.uid() for update;
 if prefs is null then raise exception 'Private booking drafts unavailable';end if;
 items=coalesce(prefs->'pending_bookings','[]'::jsonb);
 if jsonb_typeof(items)<>'array' then raise exception 'Booking draft format needs review';end if;
 select value into old_entry from jsonb_array_elements(items) where value->>'id'=item_id::text;
 if remove_item then
  if old_entry is null then return null;end if;
  if (old_entry->>'revision')::integer<>expected_revision then raise exception 'Booking changed in another tab';end if;
  if exists(select 1 from public.booking_attachments a where a.trip_id=target and a.intake_id=item_id and a.booking_id is null) then raise exception 'Remove private files before removing this entry';end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into items from jsonb_array_elements(items) where value->>'id'<>item_id::text;
  update public.trip_onboarding set preferences=jsonb_set(prefs,'{pending_bookings}',items) where trip_id=target;
  return null;
 end if;
 if jsonb_typeof(entry)<>'object' or length(entry::text)>25000 or jsonb_typeof(entry->'fields') is distinct from 'object' or coalesce(entry->>'review_status','') not in ('needs_review','reviewed') or coalesce(entry->>'reservation_status','') not in ('unknown','confirmed','pending','cancelled') or coalesce(entry->>'method','') not in ('manual','text','ai') then raise exception 'Invalid booking draft';end if;
 payload=(entry-'revision'-'updated_at')||jsonb_build_object('id',item_id);
 if old_entry is not null and old_entry-'revision'-'updated_at'=payload then return old_entry;end if;
 if old_entry is null then
  if expected_revision<>0 then raise exception 'Booking draft unavailable';end if;
  if jsonb_array_length(items)>=20 then raise exception 'Collect up to 20 booking entries at a time';end if;
 else
  if (old_entry->>'revision')::integer<>expected_revision then raise exception 'Booking changed in another tab';end if;
  if coalesce((old_entry->>'removing')::boolean,false) and entry->'removing' is distinct from old_entry->'removing' then raise exception 'Finish removing this booking before editing it';end if;
  if old_entry->'source' is not null and old_entry->'source'<>'null'::jsonb and entry->'source' is distinct from old_entry->'source' then raise exception 'Original source cannot be replaced';end if;
 end if;
 if entry->>'review_status'='reviewed' then
  if coalesce(entry->'fields'->>'title','')='' or coalesce(entry->'fields'->>'category','') not in ('flight','accommodation','ground transport','ferry','car rental','activity','other') or coalesce(entry->'fields'->>'start_date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(entry->'fields'->>'end_date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(entry->'fields'->>'currency','') !~ '^[A-Z]{3}$' or not public.valid_time_zone(entry->'fields'->>'timezone') then raise exception 'Review the required booking details first';end if;
  if (entry->'fields'->>'end_date')::date<(entry->'fields'->>'start_date')::date then raise exception 'Booking end date must follow start date';end if;
 end if;
 result=payload||jsonb_build_object('revision',expected_revision+1,'updated_at',now());
 if old_entry is null then items=items||jsonb_build_array(result);
 else
  select jsonb_agg(case when value->>'id'=item_id::text then result else value end order by ordinal) into items
  from jsonb_array_elements(items) with ordinality as x(value,ordinal);
 end if;
 update public.trip_onboarding set preferences=jsonb_set(prefs,'{pending_bookings}',items) where trip_id=target;
 return result;
end $$;
revoke all on function public.save_booking_intake(uuid,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.save_booking_intake(uuid,uuid,integer,jsonb,boolean) to authenticated;

create or replace function public.validate_private_upload() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then
  if auth.uid() is null or new.owner_id<>auth.uid() or not public.can_edit_trip(new.trip_id) then raise exception 'Editing permission required';end if;
 elsif new.id<>old.id or new.owner_id<>old.owner_id or new.path<>old.path or new.trip_id<>old.trip_id or new.intake_id is distinct from old.intake_id or new.content_sha256 is distinct from old.content_sha256 then raise exception 'Document identity cannot be changed';
 elsif new.booking_id is distinct from old.booking_id and not (old.booking_id is null and old.intake_id is not null and new.booking_id is not null and new.owner_id=auth.uid() and public.owns_trip(new.trip_id)) then raise exception 'Document booking link cannot be changed';end if;
 if new.booking_id is not null then
  if not exists(select 1 from public.bookings b where b.id=new.booking_id and b.trip_id=new.trip_id) then raise exception 'Booking unavailable';end if;
 elsif new.intake_id is null or not public.owns_trip(new.trip_id) or new.content_sha256 is null or not exists(select 1 from public.trip_onboarding o,jsonb_array_elements(coalesce(o.preferences->'pending_bookings','[]')) e where o.trip_id=new.trip_id and o.owner_id=auth.uid() and e->>'id'=new.intake_id::text and e->'source'->>'attachment_id'=new.id::text and e->'source'->>'checksum'=new.content_sha256) then raise exception 'Private booking entry unavailable';end if;
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.intake_id,new.booking_id)::text,7733));
  if (select count(*) from public.booking_attachments a where a.trip_id=new.trip_id and coalesce(a.intake_id,a.booking_id)=coalesce(new.intake_id,new.booking_id))>=10 then raise exception 'Booking document limit reached';end if;
 end if;
 if new.state='ready' and not exists(select 1 from storage.objects o where o.bucket_id='booking-files' and o.name=new.path) then raise exception 'Upload is not complete';end if;
 return new;
end $$;
drop policy if exists documents_insert on public.booking_attachments;
create policy documents_insert on public.booking_attachments for insert to authenticated with check(
 owner_id=auth.uid() and public.can_edit_trip(trip_id) and
 ((booking_id is not null and exists(select 1 from public.bookings b where b.id=booking_id and b.trip_id=booking_attachments.trip_id)) or
 (booking_id is null and intake_id is not null and public.owns_trip(trip_id)))
);

create or replace function public.advance_booking_collection(target uuid) returns void language plpgsql security invoker set search_path='' as $$begin
 update public.trips set draft_step=greatest(draft_step,3) where id=target and owner_id=auth.uid() and creation_state='draft' and start_date is not null and end_date>=start_date;
 if not found then raise exception 'Valid private draft required';end if;
end $$;
revoke all on function public.advance_booking_collection(uuid) from public,anon;
grant execute on function public.advance_booking_collection(uuid) to authenticated;

-- Complete entries use the existing reviewed-booking RPC, never a second
-- booking table. Extend its existing manual/text/AI method and status support.
create or replace function public.save_reviewed_booking(target uuid,import_id uuid,method text,approved boolean,booking_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare existing uuid;b public.bookings;result uuid;begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 if approved is distinct from true or method not in ('manual','text','ai') or import_id is null then raise exception 'Review and approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||import_id::text,7739));
 select id into existing from public.bookings where trip_id=target and import_key=import_id;
 if existing is not null then return existing;end if;
 b=jsonb_populate_record(null::public.bookings,booking_data);
 insert into public.bookings(trip_id,segment_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude,import_key,import_method,reservation_status)
 values(target,b.segment_id,b.title,b.category,b.provider,b.reference,b.start_date,b.end_date,b.local_time,b.timezone,b.end_local_time,b.end_timezone,b.origin,b.destination,b.travelers,b.notes,b.price,b.paid_amount,b.currency,b.payment_status,'user confirmed',b.location_id,b.location_label,b.latitude,b.longitude,b.end_location_id,b.end_location_label,b.end_latitude,b.end_longitude,import_id,method,coalesce(b.reservation_status,'unknown')) returning id into result;
 return result;
end $$;
revoke all on function public.save_reviewed_booking(uuid,uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.save_reviewed_booking(uuid,uuid,text,boolean,jsonb) to authenticated;

create or replace function public.materialize_booking_intake(target uuid,item_id uuid,expected_revision integer) returns uuid language plpgsql security invoker set search_path='' as $$
declare prefs jsonb;item jsonb;result uuid;begin
 if not public.owns_trip(target) or not exists(select 1 from public.trips where id=target and creation_state='finalized') then raise exception 'Finalized trip owner required';end if;
 select preferences into prefs from public.trip_onboarding where trip_id=target and owner_id=auth.uid() for update;
 select value into item from jsonb_array_elements(coalesce(prefs->'pending_bookings','[]')) where value->>'id'=item_id::text;
 if item is null then
  select id into result from public.bookings where trip_id=target and import_key=item_id;
  if result is not null then return result;end if;raise exception 'Booking draft unavailable';
 end if;
 if item->>'review_status'<>'reviewed' or (item->>'revision')::integer<>expected_revision or coalesce((item->>'removing')::boolean,false) then raise exception 'Review the current booking first';end if;
 result=public.save_reviewed_booking(target,item_id,item->>'method',true,(item->'fields')||jsonb_build_object('reservation_status',item->>'reservation_status'));
 update public.booking_attachments set booking_id=result where trip_id=target and intake_id=item_id and booking_id is null and owner_id=auth.uid();
 perform public.save_booking_intake(target,item_id,expected_revision,'{}'::jsonb,true);
 return result;
end $$;
revoke all on function public.materialize_booking_intake(uuid,uuid,integer) from public,anon;
grant execute on function public.materialize_booking_intake(uuid,uuid,integer) to authenticated;
commit;
