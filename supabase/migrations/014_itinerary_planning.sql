-- PREPARED ONLY. Review/recovery verification and 001–013 required.
-- No existing itinerary, booking, trip or AI rows are rewritten.
begin;
alter table public.trip_segments
 add column if not exists itinerary_revision integer not null default 0 check(itinerary_revision>=0),
 add column if not exists activity_category text check(activity_category in ('Sightseeing','Food & Drink','Adventure','Relaxation','Shopping','Transportation','Other')),
 add column if not exists completed_at timestamptz,
 add column if not exists destination_location_id text check(length(destination_location_id)<=2048);
alter table public.ai_suggestions add column if not exists context jsonb not null default '{}' check(jsonb_typeof(context)='object');
alter table public.service_usage add column if not exists itinerary_request_id uuid;
create unique index if not exists itinerary_service_request on public.service_usage(actor_id,itinerary_request_id) where itinerary_request_id is not null;
create or replace function public.itinerary_revision_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.trip_id<>old.trip_id then raise exception 'Activity identity cannot change';end if;
  if (to_jsonb(new)-array['updated_at','itinerary_revision']) is distinct from (to_jsonb(old)-array['updated_at','itinerary_revision']) then new.itinerary_revision=old.itinerary_revision+1;else new.itinerary_revision=old.itinerary_revision;end if;
 end if;
 if new.destination_location_id is not null and not exists(select 1 from public.trips t cross join lateral jsonb_array_elements(coalesce(t.draft_data->'destinations','[]')) d where t.id=new.trip_id and d->>'id'=new.destination_location_id) then raise exception 'Choose a saved destination from this trip';end if;
 return new;
end $$;
revoke all on function public.itinerary_revision_guard() from public,anon;
create or replace trigger itinerary_revision before insert or update on public.trip_segments for each row execute function public.itinerary_revision_guard();

-- One narrow invoker boundary for atomic activity operations; existing RLS stays active.
create or replace function public.change_itinerary(target uuid, command jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trips;s public.trip_segments;idea public.ai_suggestions;b public.bookings;v jsonb;part jsonb;op text;ident uuid;day date;starts text;ends text;zone text;dest text;dated uuid;duration integer;position_value integer;seen uuid[]='{}';current_ids uuid[];result uuid;begin
 if auth.uid() is null or not public.can_edit_trip(target) then raise exception 'Trip editing permission required';end if;
 -- Serialize related new operations per trip; row revisions also detect legacy edits.
 perform pg_advisory_xact_lock(hashtextextended(target::text,814));
 select * into t from public.trips where id=target;
 if not found or t.creation_state<>'finalized' then raise exception 'Finalized trip unavailable';end if;
 op=command->>'op';v=command->'input';
 if op='reorder' then
  day=(command->>'day')::date;
  if jsonb_typeof(command->'order') is distinct from 'array' or jsonb_array_length(command->'order')>500 then raise exception 'Invalid activity order';end if;
  perform 1 from public.trip_segments where trip_id=target and kind in ('activity','note') and status<>'idea' and start_date=day and end_date=day and local_time='' for update;
  select coalesce(array_agg(id order by id),'{}') into current_ids from public.trip_segments where trip_id=target and kind in ('activity','note') and status<>'idea' and start_date=day and end_date=day and local_time='';
  for part in select value from jsonb_array_elements(command->'order') loop
   ident=(part->>'id')::uuid;
   if ident=any(seen) then raise exception 'Duplicate activity in order';end if;
   seen=array_append(seen,ident);
   if not exists(select 1 from public.trip_segments where id=ident and trip_id=target and itinerary_revision=(part->>'revision')::integer and kind in ('activity','note') and status<>'idea' and start_date=day and end_date=day and local_time='') then raise exception 'Plans changed. Reload before reordering';end if;
  end loop;
  if (select coalesce(array_agg(x order by x),'{}') from unnest(seen) x) is distinct from current_ids then raise exception 'Plans changed. Reload before reordering';end if;
  position_value=0;
  foreach ident in array seen loop update public.trip_segments set position=position_value where id=ident and trip_id=target;position_value=position_value+1;end loop;
  return jsonb_build_object('message','Activity order saved.');
 elsif op='unlink' then
  select * into b from public.bookings where id=(command->>'id')::uuid and trip_id=target for update;
  if not found or b.segment_id is distinct from (command->>'segment')::uuid then raise exception 'Booking link changed. Reload before unlinking';end if;
  update public.bookings set segment_id=null where id=b.id and trip_id=target;
  return jsonb_build_object('message','Booking unlinked. The booking is still in Bookings.');
 elsif op in ('add-idea','dismiss-idea') then
  select * into idea from public.ai_suggestions where id=(command->>'id')::uuid and trip_id=target for update;
  if not found then raise exception 'Suggestion unavailable';end if;
  if op='dismiss-idea' then
   if idea.accepted_segment_id is not null then raise exception 'This suggestion has already been saved';end if;
   update public.ai_suggestions set dismissed=true where id=idea.id;return jsonb_build_object('message','Suggestion dismissed.');
  end if;
  if idea.accepted_segment_id is not null then return jsonb_build_object('id',idea.accepted_segment_id,'message','This suggestion is already saved.');end if;
  if idea.dismissed then raise exception 'Suggestion was dismissed';end if;
  day=(command->>'day')::date;
  if day is null or t.start_date is null or t.end_date is null or day<t.start_date or day>t.end_date then raise exception 'Choose a day within your trip dates';end if;
  -- Reuse the existing authorization-safe suggestion acceptance and stable ID.
  result=public.accept_ai_idea(idea.id);
  v=jsonb_build_object('id',result,'revision',0,'title',idea.title,'day',day,'start','','end','','location','','notes',idea.note,'destination',coalesce(command->>'destination',''),'category',case idea.category when 'food' then 'Food & Drink' when 'activity' then 'Other' when 'relaxation' then 'Relaxation' when 'transport' then 'Transportation' else 'Other' end);
  op='save';
 end if;
 if op not in ('save','delete','complete') or op is null then raise exception 'Unsupported itinerary action';end if;
 ident=case when op='save' then (v->>'id')::uuid else (command->>'id')::uuid end;
 select * into s from public.trip_segments where id=ident and trip_id=target for update;
 if op in ('delete','complete') then
  if s.id is null or s.kind not in ('activity','note') then raise exception 'Activity unavailable';end if;
  if s.itinerary_revision is distinct from (command->>'revision')::integer then raise exception 'This activity changed. Reload before saving';end if;
  if op='delete' then delete from public.trip_segments where id=s.id and trip_id=target;return jsonb_build_object('message','Activity removed. Linked bookings are preserved.');end if;
  if s.status='idea' or s.start_date>(now() at time zone s.timezone)::date then raise exception 'Complete activities on or after their scheduled day';end if;
  update public.trip_segments set completed_at=case when completed_at is null then clock_timestamp() else null end where id=s.id and trip_id=target;
  return jsonb_build_object('message','Activity completion saved.');
 end if;
 if s.id is not null then
  if s.kind not in ('activity','note') or s.start_date<>s.end_date then raise exception 'Use the existing detailed editor for this plan';end if;
  -- Lost create responses may be retried: return the same row only for matching content.
  if s.itinerary_revision is distinct from (v->>'revision')::integer then raise exception 'This activity changed. Reload before saving';end if;
 elsif (v->>'revision')::integer is distinct from 0 then raise exception 'Activity unavailable';end if;
 day=(v->>'day')::date;starts=coalesce(v->>'start','');ends=coalesce(v->>'end','');dest=nullif(v->>'destination','');
 if day is null or t.start_date is null or t.end_date is null or day<t.start_date or day>t.end_date then raise exception 'Choose a day within your trip dates';end if;
 if length(btrim(coalesce(v->>'title',''))) not between 1 and 200 or length(coalesce(v->>'notes',''))>4000 or length(coalesce(v->>'location',''))>500 then raise exception 'Check the activity name, notes and location';end if;
 if (starts<>'' and starts!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') or (ends<>'' and (starts='' or ends!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or ends<=starts)) then raise exception 'Choose an end time after the start time on the same day';end if;
 zone=coalesce(s.timezone,t.timezone);dated=null;
 if dest is not null then
  select d.timezone,d.id into zone,dated from public.trip_segments d where d.id::text=dest and d.trip_id=target and d.kind='destination' and d.status<>'idea';
  if dated is null then
   select d->>'timezone' into zone from jsonb_array_elements(coalesce(t.draft_data->'destinations','[]')) d where d->>'id'=dest limit 1;
  end if;
  if zone is null or not public.valid_time_zone(zone) then raise exception 'Choose a saved destination from this trip';end if;
 end if;
 if starts<>'' and to_char(((day::text||' '||starts)::timestamp at time zone zone) at time zone zone,'YYYY-MM-DD HH24:MI')<>day::text||' '||starts then raise exception 'This local time does not exist due to a clock change';end if;
 if ends<>'' and to_char(((day::text||' '||ends)::timestamp at time zone zone) at time zone zone,'YYYY-MM-DD HH24:MI')<>day::text||' '||ends then raise exception 'This local time does not exist due to a clock change';end if;
 duration=case when ends<>'' then extract(epoch from (((day::text||' '||ends)::timestamp at time zone zone)-((day::text||' '||starts)::timestamp at time zone zone)))::integer/60 else null end;
 if duration is not null and duration<=0 then raise exception 'Choose an end time after the start time';end if;
 if s.id is null then
  select coalesce(max(position)+1,0) into position_value from public.trip_segments where trip_id=target and start_date=day;
  insert into public.trip_segments(id,trip_id,kind,title,start_date,end_date,local_time,timezone,status,notes,address,position,duration_minutes,activity_category,destination_id,destination_location_id)
  values(ident,target,'activity',btrim(v->>'title'),day,day,starts,zone,'planned',coalesce(v->>'notes',''),coalesce(v->>'location',''),position_value,duration,nullif(v->>'category',''),dated,case when dated is null then dest end);
 else
  update public.trip_segments set title=btrim(v->>'title'),start_date=day,end_date=day,local_time=starts,timezone=zone,notes=coalesce(v->>'notes',''),address=coalesce(v->>'location',''),duration_minutes=duration,activity_category=nullif(v->>'category',''),destination_id=dated,destination_location_id=case when dated is null then dest end,
  status=case when status='idea' or (status='confirmed' and (start_date<>day or local_time<>starts)) then 'planned' else status end,
  completed_at=case when start_date<>day then null else completed_at end,
  location_id=case when address=coalesce(v->>'location','') then location_id else null end,location_label=case when address=coalesce(v->>'location','') then location_label else null end,latitude=case when address=coalesce(v->>'location','') then latitude else null end,longitude=case when address=coalesce(v->>'location','') then longitude else null end
  where id=ident and trip_id=target;
 end if;
 return jsonb_build_object('id',ident,'message','Activity saved.');
end $$;
revoke all on function public.change_itinerary(uuid,jsonb) from public,anon;
grant execute on function public.change_itinerary(uuid,jsonb) to authenticated;

-- Reuse quotas and usage ledger; request keys prevent a double click/retry from
-- reserving or charging another provider request. No provider is called in SQL.
create or replace function public.reserve_itinerary_ideas(target uuid,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare usage public.service_usage;reservation uuid;begin
 if auth.uid() is null or not public.can_edit_trip(target) or request_id is null then raise exception 'Trip editing permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,815));
 select * into usage from public.service_usage where actor_id=auth.uid() and itinerary_request_id=request_id;
 if found then
  if usage.trip_id is distinct from target then raise exception 'Request belongs to a different trip';end if;
  return jsonb_build_object('id',usage.id,'created',false,'outcome',usage.outcome);
 end if;
 reservation=public.reserve_service(target,'ai');
 update public.service_usage set itinerary_request_id=request_id where id=reservation and actor_id=auth.uid();
 return jsonb_build_object('id',reservation,'created',true,'outcome','reserved');
end $$;
revoke all on function public.reserve_itinerary_ideas(uuid,uuid) from public,anon;
grant execute on function public.reserve_itinerary_ideas(uuid,uuid) to authenticated;
-- This trusted-owner boundary only reserves quota; it cannot mutate trip plans.
do $$ begin
 if exists(select 1 from pg_catalog.pg_proc p where p.oid='public.reserve_itinerary_ideas(uuid,uuid)'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then raise exception 'Quota wrapper requires a trusted migration administrator owner';end if;
end $$;
create or replace function public.persist_itinerary_ideas(target uuid,reservation uuid,request_id uuid,source_context jsonb,ideas jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;usage public.service_usage;begin
 if auth.uid() is null or not public.can_edit_trip(target) then raise exception 'Trip editing permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,815));
 select * into usage from public.service_usage where id=reservation and actor_id=auth.uid() and trip_id=target and itinerary_request_id=request_id;
 if not found then raise exception 'Request unavailable';end if;
 if usage.outcome='succeeded' then return;end if;
 if usage.outcome<>'reserved' then raise exception 'Request failed. Start another request';end if;
 if jsonb_typeof(ideas) is distinct from 'array' or jsonb_array_length(ideas)>5 or jsonb_typeof(source_context) is distinct from 'object' or length(source_context::text)>16000 then raise exception 'Unsupported ideas response';end if;
 for item in select value from jsonb_array_elements(ideas) loop
  if length(btrim(coalesce(item->>'title',''))) not between 1 and 200 or length(coalesce(item->>'note','')) not between 1 and 1800 or item->>'category' not in ('food','activity','relaxation','transport','other') or item->>'category' is null then raise exception 'Unsupported idea';end if;
  if not exists(select 1 from public.ai_suggestions where trip_id=target and not dismissed and lower(btrim(title))=lower(btrim(item->>'title'))) and not exists(select 1 from public.trip_segments where trip_id=target and lower(btrim(title))=lower(btrim(item->>'title'))) then
   insert into public.ai_suggestions(trip_id,title,note,category,source,context) values(target,btrim(item->>'title'),item->>'note',item->>'category','ai',source_context||jsonb_build_object('request_id',request_id));
  end if;
 end loop;
 perform public.finish_service(reservation,true);
end $$;
revoke all on function public.persist_itinerary_ideas(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.persist_itinerary_ideas(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
commit;
