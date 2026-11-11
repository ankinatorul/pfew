-- Review and apply only AFTER 010 and explicit approval.
-- Supabase's reported defaults grant anon EXECUTE directly. Revoking PUBLIC
-- alone (as in older migrations) does not revoke that separate role grant.
-- No rows, RLS policies, project defaults or service/admin grants are changed.
begin;

revoke all on function public.save_trip_draft(uuid,integer,jsonb)
  from public, anon;
grant execute on function public.save_trip_draft(uuid,integer,jsonb)
  to authenticated;

revoke all on function public.accept_ai_idea(uuid)
  from public, anon;
grant execute on function public.accept_ai_idea(uuid)
  to authenticated;

commit;
