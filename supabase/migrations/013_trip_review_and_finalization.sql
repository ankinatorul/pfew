-- PREPARED ONLY: developer review, recovery verification and 010–012 required.
-- No existing dates, expenses, budgets, bookings or themes are reclassified.
begin;
alter table public.trips add column if not exists theme text not null default 'Default'
 check(theme in ('Default','Tropical','City Break','Ski','Mountain'));

-- Only the deliberately privileged finalizer can cross the existing publication
-- boundary. A forgeable session flag is NOT used. Its owner must be a trusted
-- migration administrator; review ownership/grants before application.
create or replace function public.validate_private_draft() returns trigger language plpgsql set search_path='' as $$
declare d jsonb;publisher name;begin
 if tg_op='UPDATE' then
  if new.creation_state<>old.creation_state then
   select pg_catalog.pg_get_userbyid(p.proowner) into publisher from pg_catalog.pg_proc p
    where p.oid='public.finalize_trip_draft(uuid,integer,text,jsonb,text)'::regprocedure;
   if old.creation_state<>'draft' or new.creation_state<>'finalized' or current_user<>publisher then raise exception 'Trip publication state cannot be changed directly';end if;
  end if;
  if old.creation_state='finalized' and new.theme is distinct from old.theme then raise exception 'Trip theme is stable after creation';end if;
  if old.creation_state='draft' and new.creation_state='draft' and row(new.name,new.start_date,new.end_date,new.style,new.draft_data) is distinct from row(old.name,old.start_date,old.end_date,old.style,old.draft_data) then new.draft_revision=old.draft_revision+1;end if;
 end if;
 if new.creation_state='draft' or (tg_op='UPDATE' and old.creation_state='draft') then
  if new.start_date is null or new.end_date is null or new.end_date<new.start_date then raise exception 'Choose valid departure and return dates before continuing';end if;
  if length(btrim(new.name)) not between 1 and 120 or jsonb_typeof(new.draft_data->'destinations') is distinct from 'array' or jsonb_array_length(new.draft_data->'destinations') not between 1 and 32 then raise exception 'A draft needs a name and at least one destination';end if;
  for d in select value from jsonb_array_elements(new.draft_data->'destinations') loop
   if jsonb_typeof(d) is distinct from 'object' or coalesce(length(d->>'id'),0) not between 1 and 2048 or coalesce(length(d->>'label'),0) not between 1 and 500 or not public.valid_time_zone(d->>'timezone') then raise exception 'Invalid draft destination';end if;
   if jsonb_typeof(d->'latitude') is distinct from 'number' or jsonb_typeof(d->'longitude') is distinct from 'number' or (d->>'latitude')::numeric not between -90 and 90 or (d->>'longitude')::numeric not between -180 and 180 then raise exception 'Verified destination coordinates required';end if;
  end loop;
 end if;return new;
end $$;

create or replace function public.save_trip_review(target uuid,expected_revision integer,tier text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trips;begin
 if auth.uid() is null or tier not in ('Budget','Comfort','Luxury') or tier is null then raise exception 'Choose a valid travel style';end if;
 select * into t from public.trips where id=target and owner_id=auth.uid() and creation_state='draft' for update;
 if not found then raise exception 'Private draft unavailable';end if;
 if expected_revision is null or t.draft_revision<>expected_revision then raise exception 'Draft changed. Reload your review';end if;
 update public.trips set style=tier,draft_step=3 where id=target returning * into t;
 return to_jsonb(t);
end $$;
revoke all on function public.save_trip_review(uuid,integer,text) from public,anon;
grant execute on function public.save_trip_review(uuid,integer,text) to authenticated;

create or replace function public.finalize_trip_draft(target uuid,expected_revision integer,tier text,expected_bookings jsonb,assigned_theme text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trips;prefs jsonb;items jsonb;stamp jsonb;item jsonb;reviewed integer;unfinished integer;begin
 -- This is the ONLY privileged boundary. Restrict every row to auth.uid(),
 -- lock before validation, use qualified objects, and expose no arbitrary SQL.
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into t from public.trips where id=target and owner_id=auth.uid() for update;
 if not found then raise exception 'Private draft unavailable';end if;
 if t.creation_state='finalized' then
  if t.draft_data ? 'finalization_receipt' then return to_jsonb(t);end if;
  raise exception 'This trip was not created from this draft';
 end if;
 if expected_revision is null or t.draft_revision<>expected_revision then raise exception 'Draft changed. Reload your review';end if;
 if tier is null or tier not in ('Budget','Comfort','Luxury') or assigned_theme is null or assigned_theme not in ('Default','Tropical','City Break','Ski','Mountain') then raise exception 'Invalid trip preferences';end if;
 -- Trigger revalidates required name/destinations/date range before publishing.
 select preferences into prefs from public.trip_onboarding where trip_id=target and owner_id=auth.uid() for update;
 items=coalesce(prefs->'pending_bookings','[]'::jsonb);
 if jsonb_typeof(items)<>'array' then raise exception 'Booking draft format needs review';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',value->'id','revision',value->'revision') order by value->>'id'),'[]'::jsonb),count(*) filter(where value->>'review_status'='reviewed'),count(*) filter(where value->>'review_status'<>'reviewed')
 into stamp,reviewed,unfinished from jsonb_array_elements(items);
 if expected_bookings is distinct from stamp then raise exception 'Bookings changed. Reload your review';end if;
 -- Lock attachment metadata before converting reviewed entries. Pending uploads
 -- remain staged and recoverable; no Storage bytes are deleted or moved.
 perform 1 from public.booking_attachments where trip_id=target for update;
 update public.trips set style=tier,theme=assigned_theme,creation_state='finalized',draft_step=3,draft_revision=draft_revision+1,
 draft_data=draft_data||jsonb_build_object('finalization_receipt',jsonb_build_object('reviewed',reviewed,'unfinished',unfinished,'theme',assigned_theme,'created_at',now())) where id=target returning * into t;
 for item in select value from jsonb_array_elements(items) loop
  if item->>'review_status'='reviewed' and not coalesce((item->>'removing')::boolean,false) and
   ((item->'source') is null or item->'source'='null'::jsonb or exists(select 1 from public.booking_attachments a where a.id=(item->'source'->>'attachment_id')::uuid and a.trip_id=target and a.intake_id=(item->>'id')::uuid and a.owner_id=auth.uid() and a.state='ready')) then
   perform public.materialize_booking_intake(target,(item->>'id')::uuid,(item->>'revision')::integer);
  end if;
 end loop;
 return to_jsonb(t);
end $$;
revoke all on function public.finalize_trip_draft(uuid,integer,text,jsonb,text) from public,anon;
grant execute on function public.finalize_trip_draft(uuid,integer,text,jsonb,text) to authenticated;
do $$ begin
 if exists(select 1 from pg_catalog.pg_proc p where p.oid='public.finalize_trip_draft(uuid,integer,text,jsonb,text)'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then raise exception 'Finalizer must be owned by a trusted migration administrator';end if;
end $$;
commit;
