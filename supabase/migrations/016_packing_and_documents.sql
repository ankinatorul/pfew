-- PREPARED ONLY. Review 001–015, existing Storage policies and recovery first.
-- Existing files, paths, booking/intake links and completion states are preserved.
begin;
alter table public.packing_items add column if not exists notes text not null default '' check(length(notes)<=1000),add column if not exists position integer not null default 0 check(position>=0),add column if not exists packing_revision integer not null default 0 check(packing_revision>=0);
alter table public.packing_lists add column if not exists packing_revision integer not null default 0 check(packing_revision>=0);
alter table public.prep_tasks add column if not exists readiness_revision integer not null default 0 check(readiness_revision>=0);
alter table public.booking_attachments
 add column if not exists document_kind text not null default 'booking' check(document_kind in ('booking','trip')),
 add column if not exists display_name text check(display_name is null or length(btrim(display_name)) between 1 and 200),
 add column if not exists document_category text not null default 'Other' check(document_category in ('Passport & ID','Tickets','Visas','Insurance','Reservations','Other')),
 add column if not exists documents_hidden boolean not null default false,
 add column if not exists document_revision integer not null default 0 check(document_revision>=0);
alter table public.booking_attachments drop constraint if exists attachment_collection_path;
alter table public.booking_attachments drop constraint if exists attachment_document_path;
alter table public.booking_attachments add constraint attachment_document_path check(
 (document_kind='booking' and (booking_id is not null or intake_id is not null) and path=owner_id::text||'/'||trip_id::text||'/'||coalesce(intake_id,booking_id)::text||'/'||id::text)
 or (document_kind='trip' and booking_id is null and intake_id is null and not documents_hidden and content_sha256 is not null and path=owner_id::text||'/'||trip_id::text||'/documents/'||id::text)
);
-- Keep the existing 012 booking/intake guard intact, including binding originals
-- to reviewed bookings. It still handles every legacy/default booking file.
create or replace trigger private_upload before insert or update on public.booking_attachments for each row when (new.document_kind='booking') execute function public.validate_private_upload();
create or replace function public.document_identity_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.id<>old.id or new.trip_id<>old.trip_id or new.owner_id<>old.owner_id or new.path<>old.path or new.document_kind<>old.document_kind or new.filename<>old.filename or new.size<>old.size or new.content_type<>old.content_type or new.content_sha256 is distinct from old.content_sha256 then raise exception 'Document identity cannot change';end if;
 if (to_jsonb(new)-'document_revision') is distinct from (to_jsonb(old)-'document_revision') then new.document_revision=old.document_revision+1;else new.document_revision=old.document_revision;end if;
 return new;
end $$;
revoke all on function public.document_identity_guard() from public,anon;
create or replace trigger document_identity before update on public.booking_attachments for each row execute function public.document_identity_guard();
-- A narrow privileged guard can verify Storage receipt without publishing bytes.
create or replace function public.validate_trip_document() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or new.owner_id<>auth.uid() then raise exception 'Private document owner required';end if;
 if tg_op='INSERT' then
  if not public.can_edit_trip(new.trip_id) or not exists(select 1 from public.trips where id=new.trip_id and creation_state='finalized') then raise exception 'Finalized trip editing permission required';end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text||new.trip_id::text,1016));
  if (select count(*) from public.booking_attachments where trip_id=new.trip_id and owner_id=new.owner_id and document_kind='trip')>=100 then raise exception 'Trip document limit reached';end if;
 end if;
 if new.state='ready' and not exists(select 1 from storage.objects o where o.bucket_id='booking-files' and o.name=new.path) then raise exception 'Upload is not complete';end if;
 return new;
end $$;
revoke all on function public.validate_trip_document() from public,anon;
create or replace trigger trip_document_upload before insert or update on public.booking_attachments for each row when(new.document_kind='trip') execute function public.validate_trip_document();
drop policy if exists documents_insert on public.booking_attachments;
create policy documents_insert on public.booking_attachments for insert to authenticated with check(
 owner_id=auth.uid() and public.can_edit_trip(trip_id) and
 ((document_kind='booking' and ((booking_id is not null and exists(select 1 from public.bookings b where b.id=booking_id and b.trip_id=booking_attachments.trip_id)) or (booking_id is null and intake_id is not null and public.owns_trip(trip_id))))
 or (document_kind='trip' and booking_id is null and intake_id is null and exists(select 1 from public.trips t where t.id=trip_id and t.creation_state='finalized')))
);
-- Read/update/delete remain uploader-private. Existing can_access_booking_file,
-- bucket, Storage object policies and deletion guard are deliberately unchanged.
create or replace function public.save_document_metadata(target uuid,document uuid,expected_revision integer,label text,category text,hidden boolean) returns void language plpgsql security invoker set search_path='' as $$declare f public.booking_attachments;begin
 select * into f from public.booking_attachments where id=document and trip_id=target and owner_id=auth.uid() for update;
 if not found then raise exception 'Private document unavailable';end if;
 if f.document_revision is distinct from expected_revision then raise exception 'Document changed. Reload before saving';end if;
 if length(btrim(coalesce(label,''))) not between 1 and 200 or category is null or category not in ('Passport & ID','Tickets','Visas','Insurance','Reservations','Other') or hidden is null then raise exception 'Check document name and category';end if;
 if f.document_kind='trip' and hidden then raise exception 'Only booking shortcuts can be hidden';end if;
 update public.booking_attachments set display_name=btrim(label),document_category=category,documents_hidden=hidden where id=document and trip_id=target and owner_id=auth.uid();
end $$;
create or replace function public.packing_revision_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.id<>old.id or new.trip_id<>old.trip_id then raise exception 'Packing identity cannot change';end if;
 if (to_jsonb(new)-'packing_revision') is distinct from (to_jsonb(old)-'packing_revision') then new.packing_revision=old.packing_revision+1;else new.packing_revision=old.packing_revision;end if;return new;
end $$;
revoke all on function public.packing_revision_guard() from public,anon;
create or replace trigger packing_revision before update on public.packing_items for each row execute function public.packing_revision_guard();
create or replace trigger packing_revision before update on public.packing_lists for each row execute function public.packing_revision_guard();
create or replace function public.preparation_revision_guard() returns trigger language plpgsql set search_path='' as $$begin
 if (to_jsonb(new)-'readiness_revision') is distinct from (to_jsonb(old)-'readiness_revision') then new.readiness_revision=old.readiness_revision+1;else new.readiness_revision=old.readiness_revision;end if;return new;
end $$;
revoke all on function public.preparation_revision_guard() from public,anon;
create or replace trigger preparation_revision before update on public.prep_tasks for each row execute function public.preparation_revision_guard();
create or replace function public.change_packing(target uuid,command jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare op text;v jsonb;s public.packing_items;l public.packing_lists;part record;ident uuid;selected_list uuid;seen uuid[]='{}';current_ids uuid[];item jsonb;count_added integer=0;pos integer=0;begin
 if auth.uid() is null or not public.can_edit_trip(target) or not exists(select 1 from public.trips where id=target and creation_state='finalized') then raise exception 'Trip editing permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,1017));op=command->>'op';v=command->'input';
 if op='list' then
  if length(btrim(coalesce(command->>'traveler',''))) not between 1 and 100 then raise exception 'Name this packing list';end if;
  select * into l from public.packing_lists where id=(command->>'id')::uuid and trip_id=target;
  if l.id is not null then return jsonb_build_object('id',l.id,'message','Packing list is already saved.');end if;
  select * into l from public.packing_lists where trip_id=target and lower(btrim(traveler))=lower(btrim(command->>'traveler'));
  if l.id is not null then return jsonb_build_object('id',l.id,'message','This packing list already exists.');end if;
  insert into public.packing_lists(id,trip_id,traveler) values((command->>'id')::uuid,target,btrim(command->>'traveler')) returning * into l;
  return jsonb_build_object('id',l.id,'message','Packing list saved.');
 end if;
 if op='save' then ident=(v->>'id')::uuid;selected_list=(v->>'list_id')::uuid;
 elsif op in ('packed','delete') then ident=(command->>'id')::uuid;select * into s from public.packing_items where id=ident and trip_id=target for update;selected_list=s.list_id;
 else selected_list=coalesce(command->>'list_id',command->>'id')::uuid;end if;
 select * into l from public.packing_lists where id=selected_list and trip_id=target for update;if not found then raise exception 'Packing list unavailable';end if;
 if op='delete-list' then
  perform 1 from public.packing_items where trip_id=target and list_id=l.id for update;
  if l.packing_revision is distinct from (command->>'revision')::integer or (select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',packing_revision) order by id),'[]') from public.packing_items where trip_id=target and list_id=l.id) is distinct from (select coalesce(jsonb_agg(value order by value->>'id'),'[]') from jsonb_array_elements(command->'items')) then raise exception 'Packing list changed. Reload before removing';end if;
  delete from public.packing_lists where id=l.id and trip_id=target;return jsonb_build_object('message','Packing list removed.');
 elsif op='reorder' then
  if jsonb_typeof(command->'order') is distinct from 'array' or jsonb_array_length(command->'order')>1000 then raise exception 'Invalid item order';end if;
  perform 1 from public.packing_items where trip_id=target and list_id=l.id for update;
  select coalesce(array_agg(id order by id),'{}') into current_ids from public.packing_items where trip_id=target and list_id=l.id;
  for item in select value from jsonb_array_elements(command->'order') loop
   ident=(item->>'id')::uuid;if ident=any(seen) or not exists(select 1 from public.packing_items where id=ident and trip_id=target and list_id=l.id and packing_revision=(item->>'revision')::integer) then raise exception 'Packing items changed. Reload before reordering';end if;seen=array_append(seen,ident);
  end loop;
  if (select coalesce(array_agg(x order by x),'{}') from unnest(seen) x) is distinct from current_ids then raise exception 'Packing items changed. Reload before reordering';end if;
  foreach ident in array seen loop update public.packing_items set position=pos where id=ident and trip_id=target;pos=pos+1;end loop;
  return jsonb_build_object('message','Packing order saved.');
 elsif op in ('copy','template') then
  if op='copy' then
   if not exists(select 1 from public.packing_lists p join public.trips t on t.id=p.trip_id where p.id=(command->>'source')::uuid and t.owner_id=auth.uid() and t.creation_state='finalized') then raise exception 'Choose one of your own saved packing lists';end if;
   for part in select title,category,quantity from public.packing_items where list_id=(command->>'source')::uuid loop
    if not exists(select 1 from public.packing_items where list_id=l.id and lower(regexp_replace(btrim(title),'\s+',' ','g'))=lower(regexp_replace(btrim(part.title),'\s+',' ','g'))) then insert into public.packing_items(trip_id,list_id,title,category,quantity,packed) values(target,l.id,part.title,part.category,part.quantity,false);count_added=count_added+1;end if;
   end loop;
  else
   if not exists(select 1 from public.packing_templates where id=(command->>'source')::uuid and owner_id=auth.uid()) then raise exception 'Saved template unavailable';end if;
   for item in select value from public.packing_templates p cross join lateral jsonb_array_elements(p.items) where p.id=(command->>'source')::uuid and p.owner_id=auth.uid() loop
    if not exists(select 1 from public.packing_items where list_id=l.id and lower(regexp_replace(btrim(title),'\s+',' ','g'))=lower(regexp_replace(btrim(item->>'title'),'\s+',' ','g'))) then insert into public.packing_items(trip_id,list_id,title,category,quantity,packed) values(target,l.id,item->>'title',item->>'category',(item->>'quantity')::integer,false);count_added=count_added+1;end if;
   end loop;
  end if;return jsonb_build_object('message',count_added::text||' new items copied. Packed states and notes were not copied.');
 elsif op in ('packed','delete') then
  if s.id is null or s.packing_revision is distinct from (command->>'revision')::integer then raise exception 'Packing item changed. Reload before saving';end if;
  if op='delete' then delete from public.packing_items where id=s.id and trip_id=target;else update public.packing_items set packed=(command->>'packed')::boolean where id=s.id and trip_id=target;end if;
  return jsonb_build_object('message','Packing item saved.');
 elsif op='save' then
  select * into s from public.packing_items where id=ident and trip_id=target for update;
  if s.id is not null and (s.list_id<>l.id or s.packing_revision is distinct from (v->>'revision')::integer) then raise exception 'Packing item changed. Reload before saving';end if;
  if s.id is null and (v->>'revision')::integer is distinct from 0 then raise exception 'Packing item unavailable';end if;
  if length(btrim(coalesce(v->>'title',''))) not between 1 and 200 or length(coalesce(v->>'notes',''))>1000 or (v->>'quantity') is null then raise exception 'Check item name and quantity';end if;
  if exists(select 1 from public.packing_items where list_id=l.id and id<>ident and lower(regexp_replace(btrim(title),'\s+',' ','g'))=lower(regexp_replace(btrim(v->>'title'),'\s+',' ','g'))) then return jsonb_build_object('message','An item with this name already exists. Its packed state was preserved.');end if;
  if s.id is null then insert into public.packing_items(id,trip_id,list_id,title,category,quantity,notes) values(ident,target,l.id,btrim(v->>'title'),coalesce(nullif(btrim(v->>'category'),''),'Other'),(v->>'quantity')::integer,coalesce(v->>'notes',''));
  else update public.packing_items set title=btrim(v->>'title'),category=coalesce(nullif(btrim(v->>'category'),''),'Other'),quantity=(v->>'quantity')::integer,notes=coalesce(v->>'notes','') where id=ident and trip_id=target;end if;
  return jsonb_build_object('id',ident,'message','Packing item saved.');
 end if;raise exception 'Unsupported packing action';
end $$;
create or replace function public.change_preparation_reminder(target uuid,fields jsonb,remove boolean default false) returns uuid language plpgsql security invoker set search_path='' as $$declare t public.prep_tasks;ident uuid;begin
 if auth.uid() is null or not public.can_edit_trip(target) or not exists(select 1 from public.trips where id=target and creation_state='finalized') then raise exception 'Trip editing permission required';end if;
 ident=(fields->>'id')::uuid;perform pg_advisory_xact_lock(hashtextextended(target::text,1018));
 select * into t from public.prep_tasks where id=ident and trip_id=target for update;
 if t.id is not null and t.readiness_revision is distinct from (fields->>'revision')::integer then raise exception 'Reminder changed. Reload before saving';end if;
 if t.id is null and (remove or (fields->>'revision')::integer is distinct from 0) then raise exception 'Reminder unavailable';end if;
 if remove then delete from public.prep_tasks where id=ident and trip_id=target;return ident;end if;
 if length(btrim(coalesce(fields->>'title',''))) not between 1 and 200 or fields->>'category' is null or fields->>'category' not in ('Documents','Entry requirements','Health and insurance','Transportation','Accommodation','Payments','Connectivity','Other') then raise exception 'Check reminder name';end if;
 if t.id is null then
  select id into ident from public.prep_tasks where trip_id=target and lower(regexp_replace(btrim(title),'\s+',' ','g'))=lower(regexp_replace(btrim(fields->>'title'),'\s+',' ','g')) limit 1;
  if ident is not null then return ident;end if;ident=(fields->>'id')::uuid;
  insert into public.prep_tasks(id,trip_id,title,category,due_date,done) values(ident,target,btrim(fields->>'title'),fields->>'category',nullif(fields->>'due_date','')::date,(fields->>'done')::boolean);
 else
 if exists(select 1 from public.prep_tasks where trip_id=target and id<>ident and lower(regexp_replace(btrim(title),'\s+',' ','g'))=lower(regexp_replace(btrim(fields->>'title'),'\s+',' ','g'))) then raise exception 'A reminder with this name already exists';end if;
 update public.prep_tasks set title=btrim(fields->>'title'),category=fields->>'category',due_date=nullif(fields->>'due_date','')::date,done=(fields->>'done')::boolean where id=ident and trip_id=target;end if;
 return ident;
end $$;
revoke all on function public.save_document_metadata(uuid,uuid,integer,text,text,boolean),public.change_packing(uuid,jsonb),public.change_preparation_reminder(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_document_metadata(uuid,uuid,integer,text,text,boolean),public.change_packing(uuid,jsonb),public.change_preparation_reminder(uuid,jsonb,boolean) to authenticated;
do $$ begin
 if exists(select 1 from pg_catalog.pg_proc p where p.oid='public.validate_trip_document()'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')) then raise exception 'Upload guard requires trusted administrator ownership';end if;
end $$;
commit;
