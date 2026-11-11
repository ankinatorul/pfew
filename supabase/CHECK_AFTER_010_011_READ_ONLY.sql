-- Run ONLY after separately approved application of 010 THEN 011.
-- Verification only: does not call either RPC or change any records.
begin transaction read only;
select
  has_function_privilege('anon','public.save_trip_draft(uuid,integer,jsonb)','EXECUTE')
    as anonymous_draft_execute_should_be_false,
  has_function_privilege('authenticated','public.save_trip_draft(uuid,integer,jsonb)','EXECUTE')
    as signed_in_draft_execute_should_be_true,
  has_function_privilege('anon','public.accept_ai_idea(uuid)','EXECUTE')
    as anonymous_idea_execute_should_be_false,
  has_function_privilege('authenticated','public.accept_ai_idea(uuid)','EXECUTE')
    as signed_in_idea_execute_should_be_true;
commit;
