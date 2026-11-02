begin;
create table if not exists public.booking_attachments(
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,booking_id uuid not null references public.bookings on delete cascade,
 owner_id uuid not null references auth.users on delete cascade,path text not null unique,filename text not null check(length(filename) between 1 and 200),content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png')),size integer not null check(size between 1 and 3145728),created_at timestamptz not null default now(),
 check(path=owner_id::text||'/'||trip_id::text||'/'||booking_id::text||'/'||id::text)
);
alter table public.booking_attachments enable row level security;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='booking_attachments' and policyname='attachments_owner') then
 create policy attachments_owner on public.booking_attachments for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.bookings b join public.trips t on t.id=b.trip_id where b.id=booking_id and b.trip_id=booking_attachments.trip_id and t.owner_id=(select auth.uid())))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.bookings b join public.trips t on t.id=b.trip_id where b.id=booking_id and b.trip_id=booking_attachments.trip_id and t.owner_id=(select auth.uid())));
 end if;
end $$;
grant select,insert,delete on public.booking_attachments to authenticated;
-- Private bucket. No public URLs; downloads require a short-lived signed URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('booking-files','booking-files',false,3145728,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.can_access_booking_file(object_name text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.bookings b join public.trips t on t.id=b.trip_id
 where t.owner_id=auth.uid() and split_part(object_name,'/',1)=auth.uid()::text and split_part(object_name,'/',2)=t.id::text and split_part(object_name,'/',3)=b.id::text and split_part(object_name,'/',4)<>'' and split_part(object_name,'/',5)='')
$$;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname='pfew_booking_files_read') then
 create policy pfew_booking_files_read on storage.objects for select to authenticated using(bucket_id='booking-files' and public.can_access_booking_file(name));
 create policy pfew_booking_files_insert on storage.objects for insert to authenticated with check(bucket_id='booking-files' and public.can_access_booking_file(name));
 create policy pfew_booking_files_delete on storage.objects for delete to authenticated using(bucket_id='booking-files' and public.can_access_booking_file(name));
 end if;
end $$;
commit;
