-- Read-only application-data aggregates. NOT a migration. Run manually only
-- in the intended project's SQL Editor, before application and again after
-- commit BEFORE any fixture/user writes. Retain results privately for comparison.
-- No personal field values, individual identifiers or document contents returned.
-- Counts/fingerprints are NOT a restorable backup or an RLS authorization test.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '2s';

select current_database() as database_name,current_user as inspection_role,
       current_setting('transaction_read_only') as read_only;

-- Ignore only the four new 010 fields so original rows compare pre/post.
-- Fingerprints also cover IDs, owners and original timestamps. A quiet write
-- window is needed: concurrent legitimate saves can change these values.
select 'trips' as table_name,count(*) as record_count,
       count(*) filter(where start_date is null) as missing_start,
       count(*) filter(where end_date is null) as missing_end,
       count(*) filter(where end_date<start_date) as reversed_dates,
       md5(coalesce(string_agg(md5((to_jsonb(t)-array[
         'creation_state','draft_data','draft_step','draft_revision'
       ])::text),'' order by id),'')) as original_fields_fingerprint
from public.trips t;

select 'bookings' as table_name,count(*) as record_count,
       count(*) filter(where start_date is null) as missing_start,
       count(*) filter(where end_date is null) as missing_end,
       count(*) filter(where end_date<start_date) as reversed_dates,
       md5(coalesce(string_agg(md5(to_jsonb(b)::text),'' order by id),''))
         as original_fields_fingerprint
from public.bookings b;

select count(*) as bookings_without_trip
from public.bookings b left join public.trips t on t.id=b.trip_id
where t.id is null;

select count(*) as bookings_with_invalid_segment_link
from public.bookings b left join public.trip_segments s on s.id=b.segment_id
where b.segment_id is not null and (s.id is null or s.trip_id<>b.trip_id);

commit;
