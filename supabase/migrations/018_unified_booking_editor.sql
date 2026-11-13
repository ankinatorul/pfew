-- PREPARED ONLY. Review prerequisites 010–017 and recovery before application.
-- No existing rows/files are changed. Retains the same authorized booking RPC,
-- stable IDs, revision locks, RLS and monetary/itinerary relationships.
begin;
create or replace function public.save_managed_booking(target uuid,record_id uuid,expected_revision integer,fields jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare old public.bookings;v public.bookings;begin
 if auth.uid() is null or not public.can_edit_trip(target) or not exists(select 1 from public.trips where id=target and creation_state='finalized') then raise exception 'Trip editing permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(record_id::text,915));
 select * into old from public.bookings where id=record_id and trip_id=target for update;
 if old.id is not null and old.finance_revision is distinct from expected_revision then raise exception 'Booking changed. Reload before saving';end if;
 if old.id is null and expected_revision is distinct from 0 then raise exception 'Booking unavailable';end if;
 if (fields->>'price' is not null and fields->>'price' !~ '^\d{1,10}(\.\d{1,2})?$') or (fields->>'paid_amount' is not null and fields->>'paid_amount' !~ '^\d{1,10}(\.\d{1,2})?$') then raise exception 'Use known booking amounts with up to two decimal places';end if;
 -- Overlay updates on the locked existing row so absent fields never erase legacy values.
 v=jsonb_populate_record(old,fields);
 if fields ? 'payment_due_date' and nullif(fields->>'payment_due_date','') is not null then
  v.payment_due_date=(fields->>'payment_due_date')::date;
 elsif fields ? 'payment_due_date' then v.payment_due_date=null;end if;
 if v.trip_id is distinct from target then raise exception 'Booking trip mismatch';end if;
 if old.id is null then
  insert into public.bookings(id,trip_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,reservation_status,segment_id,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude,payment_due_date)
  values(record_id,target,v.title,v.category,v.provider,v.reference,v.start_date,v.end_date,v.local_time,v.timezone,v.end_local_time,v.end_timezone,v.origin,v.destination,v.travelers,v.notes,v.price,v.paid_amount,v.currency,v.payment_status,v.verification,coalesce(v.reservation_status,'unknown'),v.segment_id,v.location_id,v.location_label,v.latitude,v.longitude,v.end_location_id,v.end_location_label,v.end_latitude,v.end_longitude,v.payment_due_date);
 else
  update public.bookings set title=v.title,category=v.category,provider=v.provider,reference=v.reference,start_date=v.start_date,end_date=v.end_date,local_time=v.local_time,timezone=v.timezone,end_local_time=v.end_local_time,end_timezone=v.end_timezone,origin=v.origin,destination=v.destination,travelers=v.travelers,notes=v.notes,price=v.price,paid_amount=v.paid_amount,currency=v.currency,payment_status=v.payment_status,verification=v.verification,reservation_status=coalesce(v.reservation_status,old.reservation_status),segment_id=v.segment_id,location_id=v.location_id,location_label=v.location_label,latitude=v.latitude,longitude=v.longitude,end_location_id=v.end_location_id,end_location_label=v.end_location_label,end_latitude=v.end_latitude,end_longitude=v.end_longitude,payment_due_date=v.payment_due_date where id=record_id and trip_id=target;
 end if;return record_id;
end $$;

-- Read-only capability marker: older deployments keep managed deadlines disabled.
create or replace function public.managed_booking_editor_version() returns integer
language sql stable security invoker set search_path='' as $$ select 1 $$;
revoke all on function public.save_managed_booking(uuid,uuid,integer,jsonb),public.managed_booking_editor_version() from public,anon;
grant execute on function public.save_managed_booking(uuid,uuid,integer,jsonb),public.managed_booking_editor_version() to authenticated;
commit;
