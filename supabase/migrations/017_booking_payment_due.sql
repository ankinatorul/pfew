-- PREPARED ONLY. Review 001–016 and recovery before any live application.
-- No historical booking, expense, budget, reservation or date is reclassified.
begin;
alter table public.bookings add column if not exists payment_due_date date;

-- Existing reviewed-booking materialization explicitly selects its columns.
-- Transfer the dedicated deadline from the same owner-private intake in the
-- existing insertion transaction, before that intake is removed. No second
-- materializer, reservation change, reminder or expense is created.
create or replace function public.booking_payment_deadline() returns trigger
language plpgsql security invoker set search_path='' as $$
declare deadline text;begin
 if new.import_key is not null and new.payment_due_date is null then
  select e->'fields'->>'payment_due_date' into deadline
  from public.trip_onboarding o
  cross join lateral jsonb_array_elements(coalesce(o.preferences->'pending_bookings','[]'::jsonb)) e
  where o.trip_id=new.trip_id and o.owner_id=auth.uid() and e->>'id'=new.import_key::text;
  if nullif(deadline,'') is not null then new.payment_due_date=deadline::date;end if;
 end if;
 return new;
end $$;
revoke all on function public.booking_payment_deadline() from public,anon;
create or replace trigger booking_payment_deadline before insert on public.bookings
for each row execute function public.booking_payment_deadline();
commit;
