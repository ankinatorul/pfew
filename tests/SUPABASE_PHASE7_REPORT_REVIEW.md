# Review of the returned Phase 7 administrator report

Reviewed the user's `pfew-phase7-admin-v1` export. It ran as postgres with `read_only=on`. This review invokes no live RPC, migration or permission change. No trip/account/booking/file data was changed.

The export does not include a Supabase project reference. The database name `postgres` alone cannot distinguish development from production. Its original trip/booking fingerprints match the earlier connected report, so it represents the same original records or a copy of them. Confirm the selected Dashboard project reference before any subsequent action.

## Confirmed findings

| Area | Result |
| --- | --- |
| Trips | 5 records, 0 invalid/missing trip-date ranges |
| Bookings | 0 records; no orphan or wrong-trip segment links |
| Attachments | 0 metadata records |
| Original-data comparison | Trip and booking original-field fingerprints match the previous export |
| Phase 7 schema | All 9 checked columns absent, including draft state/revision, theme, reservation status and staged-upload fields |
| Phase 7 RPCs | Six missing: save_trip_draft, advance_booking_collection, save_booking_intake, materialize_booking_intake, save_trip_review, finalize_trip_draft |
| Existing RPC permissions | accept_ai_idea and save_reviewed_booking are present, but anon still has EXECUTE; body hashes match their previous pre-Phase-7 definitions |
| RLS | Enabled on all 25 reported public tables |
| TRUNCATE permissions | Effective TRUNCATE granted to both anon and authenticated on all 25 public tables: 50 flagged role/table combinations |
| Private Storage | booking-files is private, limit 3,145,728 bytes, PDF/JPEG/PNG MIME types |
| Metadata drift comparison | All 49 policies, 46 scoped constraints and 12 scoped triggers match the earlier export; no disabled scoped trigger reported |
| Migration ledger | Missing; not proof that the original 001–009 SQL setup is absent |

The new Create Trip flow cannot work against this current schema. This is not a finding that the original finalized trips have disappeared or that the database should be reset. Counts/fingerprints are useful preservation evidence, not a restorable backup.

## Required work

1. Establish or select an isolated development Supabase project. Confirm its reference differs from the project serving the live website. Do not create test records in the exported five-trip database merely because this report passed read-only checks.
2. On a genuinely empty development project, run complete numbered migration files 001–013 in order. On a development database already verified through 009, use only the unapplied reviewed 010–013. Do not replay the old combined 005–009 upgrade after 010, and do not infer migration history from the missing ledger.
3. Prepare/test a narrow permission correction for TRUNCATE on all flagged Pfew tables. The previous runbook's three-table example is not the complete target list: this export establishes that all 25 public tables need review. Inspect the actual creator-role default privileges too, so a later table does not inherit the same unnecessary privilege. Preserve the app's required CRUD/RPC grants and RLS. Neither 010–013 nor RLS alone fixes the old TRUNCATE privileges.
4. Apply the intended RPC permission revocations through reviewed 011/012 as part of the development migration sequence. An EXECUTE grant by itself is not proof that anonymous business-data writes succeed; the existing functions also perform authorization checks. Do not test destructive access on the live database.
5. Point `.env.local` at the isolated project's matching URL/publishable key, configure its Google callbacks, restart the local app and verify its request host. Missing/blank Supabase values still fall back to the configured live project.
6. Re-run VERIFY_PHASE7_READ_ONLY.sql there. Required columns/RPCs should be present, listed anon_execute flags false/authenticated_execute true, private bucket unchanged and effective TRUNCATE absent for untrusted app roles on Pfew tables. Review the actual finalizer owner/source/search path and RLS definitions; a missing error or green health endpoint is not sufficient.
7. Complete real development Auth/Storage/two-account draft/privacy/finalization acceptance, then plan live changes separately with a verified database-and-Storage recovery procedure and explicit approval.

Full setup instructions and conditional permission SQL: [developer runbook](SUPABASE_PHASE7_DEVELOPER_RUNBOOK.md).

## Recommendation

**GO: isolated development setup/testing. NO-GO: migration or permission changes to the shared live project based solely on this report.** No verified recovery/restore rehearsal or real isolated Supabase acceptance has been supplied, and the broad table permissions require correction/review. Existing database/RLS automated tests are isolated fixtures; they do not remove these operational blockers.

Reference: PostgreSQL's [row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) states that whole-table operations such as TRUNCATE are not governed by RLS. This is an unnecessary database privilege, not evidence that a public HTTP endpoint can execute arbitrary TRUNCATE.
