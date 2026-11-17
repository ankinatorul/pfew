-- PREPARED ONLY. Requires reviewed 018 and 016 (and their dependencies).
-- Collaboration permissions continue through existing can_edit_trip/RLS (019).
-- No historic bookings/tasks/files rewritten. Do not apply automatically.
begin;
alter table public.bookings add column payment_arrangement text not null default 'unspecified'
 check(payment_arrangement in ('unspecified','property','due_date'));
alter table public.bookings add constraint booking_payment_arrangement_date
 check(payment_status<>'unpaid' or payment_arrangement<>'due_date' or payment_due_date is not null);
alter table public.prep_tasks add column booking_id uuid unique references public.bookings(id) on delete cascade;

-- Prevent a forged task link from claiming a booking in a different trip.
create function public.validate_payment_reminder_link() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if new.booking_id is not null and not exists(select 1 from public.bookings b where b.id=new.booking_id and b.trip_id=new.trip_id) then raise exception 'Reminder booking must belong to the same trip';end if;
 return new;
end $$;
create trigger payment_reminder_link before insert or update of booking_id,trip_id on public.prep_tasks for each row execute function public.validate_payment_reminder_link();
revoke all on function public.validate_payment_reminder_link() from public,anon;

-- Transfer staged payment options during the existing materialization transaction.
create or replace function public.booking_payment_deadline() returns trigger
language plpgsql security invoker set search_path='' as $$
declare fields jsonb;begin
 if new.import_key is not null then
  select e->'fields' into fields from public.trip_onboarding o
  cross join lateral jsonb_array_elements(coalesce(o.preferences->'pending_bookings','[]'::jsonb)) e
  where o.trip_id=new.trip_id and o.owner_id=auth.uid() and e->>'id'=new.import_key::text;
  if new.payment_due_date is null and nullif(fields->>'payment_due_date','') is not null then new.payment_due_date=(fields->>'payment_due_date')::date;end if;
  if new.payment_arrangement='unspecified' and fields ? 'payment_arrangement' then new.payment_arrangement=fields->>'payment_arrangement';end if;
 end if;
 return new;
end $$;

-- One linked preparation reminder per booking; transactionally consistent with
-- booking saves, including intake materialization. Invoker respects task RLS.
create function public.sync_booking_payment_reminder() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.payment_status='unpaid' and new.payment_due_date is not null and new.payment_arrangement<>'property' and new.reservation_status<>'cancelled' then
  insert into public.prep_tasks(trip_id,booking_id,title,category,due_date,priority,done)
  values(new.trip_id,new.id,left('Pay '||new.title,160)||case when new.price is null then ' · Amount not set' else ' · '||new.price::text||' '||new.currency end,'Payments',new.payment_due_date,'normal',false)
  on conflict(booking_id) do update set title=excluded.title,due_date=excluded.due_date,done=false;
 else
  update public.prep_tasks set done=true where booking_id=new.id and trip_id=new.trip_id and not done;
 end if;
 return new;
end $$;
create trigger booking_payment_reminder after insert or update of title,price,currency,payment_status,payment_due_date,payment_arrangement,reservation_status on public.bookings
 for each row execute function public.sync_booking_payment_reminder();
revoke all on function public.sync_booking_payment_reminder() from public,anon;

create or replace function public.save_managed_booking(target uuid,record_id uuid,expected_revision integer,fields jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare old public.bookings;v public.bookings;begin
 if auth.uid() is null or not public.can_edit_trip(target) or not exists(select 1 from public.trips where id=target and creation_state='finalized') then raise exception 'Trip editing permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(record_id::text,915));
 select * into old from public.bookings where id=record_id and trip_id=target for update;
 if old.id is not null and old.finance_revision is distinct from expected_revision then raise exception 'Booking changed. Reload before saving';end if;
 if old.id is null and expected_revision is distinct from 0 then raise exception 'Booking unavailable';end if;
 if (fields->>'price' is not null and fields->>'price' !~ '^\d{1,10}(\.\d{1,2})?$') or (fields->>'paid_amount' is not null and fields->>'paid_amount' !~ '^\d{1,10}(\.\d{1,2})?$') then raise exception 'Use known booking amounts with up to two decimal places';end if;
 -- Overlay updates on the locked existing row so absent fields never erase legacy values.
 if fields ? 'payment_due_date' then fields=fields||jsonb_build_object('payment_due_date',nullif(fields->>'payment_due_date',''));end if;
 v=jsonb_populate_record(old,fields);
 if fields ? 'payment_due_date' and nullif(fields->>'payment_due_date','') is not null then
  v.payment_due_date=(fields->>'payment_due_date')::date;
 elsif fields ? 'payment_due_date' then v.payment_due_date=null;end if;
 if v.trip_id is distinct from target then raise exception 'Booking trip mismatch';end if;
 if old.id is null then
  insert into public.bookings(id,trip_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,reservation_status,segment_id,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude,payment_due_date,payment_arrangement)
  values(record_id,target,v.title,v.category,v.provider,v.reference,v.start_date,v.end_date,v.local_time,v.timezone,v.end_local_time,v.end_timezone,v.origin,v.destination,v.travelers,v.notes,v.price,v.paid_amount,v.currency,v.payment_status,v.verification,coalesce(v.reservation_status,'unknown'),v.segment_id,v.location_id,v.location_label,v.latitude,v.longitude,v.end_location_id,v.end_location_label,v.end_latitude,v.end_longitude,v.payment_due_date,coalesce(v.payment_arrangement,'unspecified'));
 else
  update public.bookings set title=v.title,category=v.category,provider=v.provider,reference=v.reference,start_date=v.start_date,end_date=v.end_date,local_time=v.local_time,timezone=v.timezone,end_local_time=v.end_local_time,end_timezone=v.end_timezone,origin=v.origin,destination=v.destination,travelers=v.travelers,notes=v.notes,price=v.price,paid_amount=v.paid_amount,currency=v.currency,payment_status=v.payment_status,verification=v.verification,reservation_status=coalesce(v.reservation_status,old.reservation_status),segment_id=v.segment_id,location_id=v.location_id,location_label=v.location_label,latitude=v.latitude,longitude=v.longitude,end_location_id=v.end_location_id,end_location_label=v.end_location_label,end_latitude=v.end_latitude,end_longitude=v.end_longitude,payment_due_date=v.payment_due_date,payment_arrangement=coalesce(v.payment_arrangement,'unspecified') where id=record_id and trip_id=target;
 end if;return record_id;
end $$;

-- Keep reviewed-intake insertion on the same authorized, idempotent booking path.
create or replace function public.save_reviewed_booking(target uuid,import_id uuid,method text,approved boolean,booking_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare existing uuid;b public.bookings;result uuid;begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 if approved is distinct from true or method not in ('manual','text','ai') or import_id is null then raise exception 'Review and approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||import_id::text,7739));
 select id into existing from public.bookings where trip_id=target and import_key=import_id;
 if existing is not null then return existing;end if;
 if booking_data ? 'payment_due_date' then booking_data=booking_data||jsonb_build_object('payment_due_date',nullif(booking_data->>'payment_due_date',''));end if;
 b=jsonb_populate_record(null::public.bookings,booking_data);
 insert into public.bookings(trip_id,segment_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude,import_key,import_method,reservation_status,payment_due_date,payment_arrangement)
 values(target,b.segment_id,b.title,b.category,b.provider,b.reference,b.start_date,b.end_date,b.local_time,b.timezone,b.end_local_time,b.end_timezone,b.origin,b.destination,b.travelers,b.notes,b.price,b.paid_amount,b.currency,b.payment_status,'user confirmed',b.location_id,b.location_label,b.latitude,b.longitude,b.end_location_id,b.end_location_label,b.end_latitude,b.end_longitude,import_id,method,coalesce(b.reservation_status,'unknown'),b.payment_due_date,coalesce(b.payment_arrangement,'unspecified')) returning id into result;
 return result;
end $$;
revoke all on function public.save_reviewed_booking(uuid,uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.save_reviewed_booking(uuid,uuid,text,boolean,jsonb) to authenticated;

create function public.booking_payment_options_version() returns integer
language sql stable security invoker set search_path='' as $$select 1$$;
revoke all on function public.booking_payment_options_version() from public,anon;
grant execute on function public.booking_payment_options_version() to authenticated;
commit;
