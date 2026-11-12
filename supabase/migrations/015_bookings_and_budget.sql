-- PREPARED ONLY. Review with existing 001–014, grants and recovery option.
-- No existing amounts, currencies, expense dates, booking status or files change.
begin;
alter table public.bookings add column if not exists finance_revision integer not null default 0 check(finance_revision>=0);
alter table public.expenses
 add column if not exists title text check(title is null or length(btrim(title)) between 1 and 200),
 add column if not exists booking_id uuid references public.bookings(id) on delete set null,
 add column if not exists finance_revision integer not null default 0 check(finance_revision>=0);
create index if not exists expense_booking on public.expenses(booking_id) where booking_id is not null;
create or replace function public.finance_record_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.trip_id<>old.trip_id then raise exception 'Record identity cannot change';end if;
  if (to_jsonb(new)-array['updated_at','finance_revision']) is distinct from (to_jsonb(old)-array['updated_at','finance_revision']) then new.finance_revision=old.finance_revision+1;else new.finance_revision=old.finance_revision;end if;
 end if;
 if tg_table_name='expenses' then
  if new.booking_id is not null and not exists(select 1 from public.bookings b where b.id=new.booking_id and b.trip_id=new.trip_id) then raise exception 'Choose a booking from the same trip';end if;
 end if;
 return new;
end $$;
revoke all on function public.finance_record_guard() from public,anon;
create or replace trigger finance_revision before insert or update on public.bookings for each row execute function public.finance_record_guard();
create or replace trigger finance_revision before insert or update on public.expenses for each row execute function public.finance_record_guard();
create or replace function public.save_managed_booking(target uuid,record_id uuid,expected_revision integer,fields jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare old public.bookings;v public.bookings;begin
 if auth.uid() is null or not public.can_edit_trip(target) or not exists(select 1 from public.trips where id=target and creation_state='finalized') then raise exception 'Trip editing permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(record_id::text,915));
 select * into old from public.bookings where id=record_id and trip_id=target for update;
 if old.id is not null and old.finance_revision is distinct from expected_revision then raise exception 'Booking changed. Reload before saving';end if;
 if old.id is null and expected_revision is distinct from 0 then raise exception 'Booking unavailable';end if;
 if (fields->>'price' is not null and fields->>'price' !~ '^\d{1,10}(\.\d{1,2})?$') or (fields->>'paid_amount' is not null and fields->>'paid_amount' !~ '^\d{1,10}(\.\d{1,2})?$') then raise exception 'Use known booking amounts with up to two decimal places';end if;
 v=jsonb_populate_record(null::public.bookings,fields);
 if v.trip_id is distinct from target then raise exception 'Booking trip mismatch';end if;
 if old.id is null then
  insert into public.bookings(id,trip_id,title,category,provider,reference,start_date,end_date,local_time,timezone,end_local_time,end_timezone,origin,destination,travelers,notes,price,paid_amount,currency,payment_status,verification,reservation_status,segment_id,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude)
  values(record_id,target,v.title,v.category,v.provider,v.reference,v.start_date,v.end_date,v.local_time,v.timezone,v.end_local_time,v.end_timezone,v.origin,v.destination,v.travelers,v.notes,v.price,v.paid_amount,v.currency,v.payment_status,v.verification,coalesce(v.reservation_status,'unknown'),v.segment_id,v.location_id,v.location_label,v.latitude,v.longitude,v.end_location_id,v.end_location_label,v.end_latitude,v.end_longitude);
 else
  update public.bookings set title=v.title,category=v.category,provider=v.provider,reference=v.reference,start_date=v.start_date,end_date=v.end_date,local_time=v.local_time,timezone=v.timezone,end_local_time=v.end_local_time,end_timezone=v.end_timezone,origin=v.origin,destination=v.destination,travelers=v.travelers,notes=v.notes,price=v.price,paid_amount=v.paid_amount,currency=v.currency,payment_status=v.payment_status,verification=v.verification,reservation_status=coalesce(v.reservation_status,old.reservation_status),segment_id=v.segment_id,location_id=v.location_id,location_label=v.location_label,latitude=v.latitude,longitude=v.longitude,end_location_id=v.end_location_id,end_location_label=v.end_location_label,end_latitude=v.end_latitude,end_longitude=v.end_longitude where id=record_id and trip_id=target;
 end if;return record_id;
end $$;
create or replace function public.change_expense(target uuid,record_id uuid,expected_revision integer,fields jsonb,remove boolean default false) returns uuid language plpgsql security invoker set search_path='' as $$
declare old public.expenses;begin
 if auth.uid() is null or not public.can_edit_trip(target) or not exists(select 1 from public.trips where id=target and creation_state='finalized') then raise exception 'Trip editing permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(record_id::text,916));
 select * into old from public.expenses where id=record_id and trip_id=target for update;
 if old.id is not null and old.finance_revision is distinct from expected_revision then raise exception 'Expense changed. Reload before saving';end if;
 if old.id is null and (remove or expected_revision is distinct from 0) then raise exception 'Expense unavailable';end if;
 if remove then delete from public.expenses where id=record_id and trip_id=target;return record_id;end if;
 if length(btrim(coalesce(fields->>'title',''))) not between 1 and 200 then raise exception 'Give your expense a name';end if;
 if fields->>'amount' !~ '^\d{1,10}(\.\d{1,2})?$' or fields->>'amount' is null or (fields->>'amount')::numeric<=0 then raise exception 'Enter a positive amount with up to two decimal places';end if;
 if old.id is null then
  insert into public.expenses(id,trip_id,title,amount,currency,category,day,payment_method,notes,booking_id) values(record_id,target,btrim(fields->>'title'),(fields->>'amount')::numeric,fields->>'currency',fields->>'category',(fields->>'day')::date,fields->>'payment_method',coalesce(fields->>'notes',''),nullif(fields->>'booking_id','')::uuid);
 else
  update public.expenses set title=btrim(fields->>'title'),amount=(fields->>'amount')::numeric,currency=fields->>'currency',category=fields->>'category',day=(fields->>'day')::date,payment_method=fields->>'payment_method',notes=coalesce(fields->>'notes',''),booking_id=nullif(fields->>'booking_id','')::uuid where id=record_id and trip_id=target;
 end if;return record_id;
end $$;
-- Existing set_trip_budget deliberately allows trip editors. Preserve that scope,
-- compare the current monetary target/currency, and never write travel style.
create or replace function public.save_monetary_budget(target uuid,total numeric,unit text,expected_total numeric,expected_unit text) returns void language plpgsql security definer set search_path='' as $$
declare t public.trips;begin
 if auth.uid() is null or not public.can_edit_trip(target) then raise exception 'Trip editing permission required';end if;
 select * into t from public.trips where id=target and creation_state='finalized' for update;
 if not found then raise exception 'Trip unavailable';end if;
 if t.budget is distinct from expected_total or t.currency is distinct from expected_unit then raise exception 'Budget changed. Reload before saving';end if;
 if (total is not null and (total<0 or total>9999999999 or total<>round(total,2))) or unit is null or unit!~'^[A-Z]{3}$' then raise exception 'Check your monetary budget and currency';end if;
 update public.trips set budget=total,currency=unit where id=target;
end $$;
revoke all on function public.save_managed_booking(uuid,uuid,integer,jsonb),public.change_expense(uuid,uuid,integer,jsonb,boolean),public.save_monetary_budget(uuid,numeric,text,numeric,text) from public,anon;
grant execute on function public.save_managed_booking(uuid,uuid,integer,jsonb),public.change_expense(uuid,uuid,integer,jsonb,boolean),public.save_monetary_budget(uuid,numeric,text,numeric,text) to authenticated;
do $$ begin
 if exists(select 1 from pg_catalog.pg_proc p where p.oid='public.save_monetary_budget(uuid,numeric,text,numeric,text)'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then raise exception 'Budget RPC requires trusted administrator ownership';end if;
end $$;
commit;
