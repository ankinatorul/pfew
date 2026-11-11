-- POC: both dates required for new private drafts. Review and apply after 009.
-- Existing rows remain finalized. No data is deleted or date constraints reversed.
begin;
alter table public.trips add column if not exists creation_state text not null default 'finalized' check (creation_state in ('draft','finalized'));
alter table public.trips add column if not exists draft_data jsonb not null default '{}' check (jsonb_typeof(draft_data)='object');
alter table public.trips add column if not exists draft_step smallint not null default 1 check (draft_step between 1 and 3);
alter table public.trips add column if not exists draft_revision integer not null default 0 check (draft_revision>=0);
create index if not exists trips_private_drafts on public.trips(owner_id,updated_at desc) where creation_state='draft';

create or replace function public.can_read_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t where t.id=target and (t.owner_id=auth.uid() or (t.creation_state='finalized' and exists(select 1 from public.trip_members m where m.trip_id=t.id and m.user_id=auth.uid()))))
$$;
create or replace function public.can_edit_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t where t.id=target and (t.owner_id=auth.uid() or (t.creation_state='finalized' and exists(select 1 from public.trip_members m where m.trip_id=t.id and m.user_id=auth.uid() and m.role='editor'))))
$$;

-- Finalization needs an explicit, atomic implementation in Phase 7E. Neither
-- generic updates nor legacy create/edit actions can publish a private draft.
create or replace function public.validate_private_draft() returns trigger language plpgsql set search_path='' as $$
declare d jsonb;
begin
 if tg_op='UPDATE' and new.creation_state<>old.creation_state then raise exception 'Trip publication state cannot be changed directly';end if;
 if new.creation_state='draft' then
  if new.start_date is null or new.end_date is null or new.end_date<new.start_date then raise exception 'Choose valid departure and return dates before continuing';end if;
  if length(btrim(new.name))=0 or jsonb_typeof(new.draft_data->'destinations') is distinct from 'array' or jsonb_array_length(new.draft_data->'destinations') not between 1 and 32 then raise exception 'A draft needs a name and at least one destination';end if;
  for d in select value from jsonb_array_elements(new.draft_data->'destinations') loop
   if jsonb_typeof(d) is distinct from 'object' or coalesce(length(d->>'id'),0) not between 1 and 2048 or coalesce(length(d->>'label'),0) not between 1 and 500 or coalesce(length(d->>'timezone'),0) not between 1 and 100 then raise exception 'Invalid draft destination';end if;
   if jsonb_typeof(d->'latitude') is distinct from 'number' or jsonb_typeof(d->'longitude') is distinct from 'number' then raise exception 'Verified destination coordinates required';end if;
   if (d->>'latitude')::numeric not between -90 and 90 or (d->>'longitude')::numeric not between -180 and 180 then raise exception 'Invalid destination coordinates';end if;
  end loop;
 end if;
 return new;
end $$;
create or replace trigger private_draft before insert or update on public.trips for each row execute function public.validate_private_draft();

create or replace function public.prevent_draft_sharing() returns trigger language plpgsql set search_path='' as $$begin
 if not exists(select 1 from public.trips t where t.id=new.trip_id and t.creation_state='finalized') then raise exception 'Private drafts cannot be shared';end if;return new;
end $$;
create or replace trigger no_draft_members before insert or update on public.trip_members for each row execute function public.prevent_draft_sharing();
create or replace trigger no_draft_invitations before insert or update on public.trip_invitations for each row execute function public.prevent_draft_sharing();

-- Invoker security: ordinary owner RLS applies to every insert/read/update.
-- The stable client UUID prevents duplicate creation; revisions prevent lost edits.
create or replace function public.save_trip_draft(target uuid,expected_revision integer,basics jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.trips; wanted jsonb;begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid draft revision';end if;
 if coalesce(basics->>'start_date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(basics->>'end_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose valid departure and return dates before continuing';end if;
 if (basics->>'end_date')::date<(basics->>'start_date')::date then raise exception 'Return date must be on or after departure';end if;
 wanted=jsonb_build_object('destinations',basics->'destinations');
 if expected_revision=0 then
  insert into public.trips(id,owner_id,name,start_date,end_date,timezone,style,currency,creation_state,draft_data,draft_step,draft_revision)
  values(target,auth.uid(),btrim(basics->>'name'),(basics->>'start_date')::date,(basics->>'end_date')::date,basics->'destinations'->0->>'timezone','Comfort','EUR','draft',wanted,2,1)
  on conflict(id) do nothing;
 end if;
 select * into saved from public.trips where id=target and owner_id=auth.uid() and creation_state='draft' for update;
 if not found then raise exception 'Private draft unavailable';end if;
 if saved.name=btrim(basics->>'name') and saved.start_date is not distinct from (basics->>'start_date')::date and saved.end_date is not distinct from (basics->>'end_date')::date and saved.draft_data->'destinations'=wanted->'destinations' then return to_jsonb(saved);end if;
 if saved.draft_revision<>expected_revision then raise exception 'This draft changed in another tab. Reload before saving again.';end if;
 update public.trips set name=btrim(basics->>'name'),start_date=(basics->>'start_date')::date,end_date=(basics->>'end_date')::date,timezone=basics->'destinations'->0->>'timezone',draft_data=draft_data||wanted,draft_step=greatest(draft_step,2),draft_revision=draft_revision+1 where id=target returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.save_trip_draft(uuid,integer,jsonb) from public;
grant execute on function public.save_trip_draft(uuid,integer,jsonb) to authenticated;
-- Preserve the existing signature, invoker RLS, atomic save and retry behavior.
-- This is a friendly guard for legacy/incomplete rows, not a date-selection flow.
create or replace function public.accept_ai_idea(suggestion uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare idea public.ai_suggestions;trip public.trips;result uuid;begin
 select * into idea from public.ai_suggestions where id=suggestion for update;
 if idea.id is null or not public.can_edit_trip(idea.trip_id) then raise exception 'Suggestion unavailable';end if;
 if idea.accepted_segment_id is not null then return idea.accepted_segment_id;end if;
 select * into trip from public.trips where id=idea.trip_id;
 if trip.start_date is null or trip.end_date is null or trip.end_date<trip.start_date then raise exception 'IDEA_DATE_REQUIRED: Add valid departure and return dates in Edit trip. Your suggestion is still saved.';end if;
 insert into public.trip_segments(trip_id,kind,title,start_date,end_date,timezone,status,notes) values(trip.id,'activity',idea.title,trip.start_date,trip.start_date,trip.timezone,'idea',idea.note) returning id into result;
 update public.ai_suggestions set accepted_segment_id=result where id=idea.id;return result;
end $$;
revoke all on function public.accept_ai_idea(uuid) from public;
grant execute on function public.accept_ai_idea(uuid) to authenticated;
commit;
