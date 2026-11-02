begin;
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
