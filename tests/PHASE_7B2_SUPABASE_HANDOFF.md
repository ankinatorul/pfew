> Connected reports have now been reviewed. Core schema compatibility is established; the two differing functions are equivalent and old onboarding has no records. The reported Supabase default grants require companion migration **011_explicit_draft_rpc_permissions.sql** after 010. Neither migration has been applied here. See [current follow-up review](CONNECTED_SUPABASE_FOLLOWUP_REVIEW.md); backup/project-use confirmation and explicit approval remain required.

# Phase 7B.2 — final POC and Supabase handoff

**Local alignment: YES. Migration required: YES. Connected-project application: NO-GO pending the checks below.**

The existing implementation requires name, at least one resolved destination, start date and end date on/after start. Invalid, missing or partial dates cannot save a new server draft or advance the handoff, including on resume. Private drafts, stable IDs, multiple independent drafts, recovery and finalized-view exclusion remain. Current details and coverage: [Phase 7B acceptance](PHASE_7B_DRAFTS_ACCEPTANCE.md).

## Exact migration and history decision

Reviewed file: `supabase/migrations/010_private_trip_drafts.sql`.
SHA-256: `2082f22aa227cf0965fd4b22477e4ee00cfed3f59559926f1764729e7b3a8c6a`.

It contains only the four draft fields (`creation_state`, `draft_data`, `draft_step`, `draft_revision`), draft-list index, draft-aware read/edit helpers, draft validation/publication/sharing triggers, atomic owner-scoped revision-aware save RPC, and the legacy-safe `accept_ai_idea(uuid)` replacement/grants. Existing records default to finalized when the state column is first added. Bookings, segment constraints, foreign keys, files, authentication and existing trip IDs are retained.

**Nullable date alterations: NO.** They are unnecessary for mandatory-date Step 1. Existing date constraints are retained, without automatically imposing NOT NULL on an already-nullable custom environment. Legacy dates are never invented or repaired. The AI action preserves normal dated behavior and rejects incomplete legacy ranges with a friendly message before inserting; the suggestion survives. Saved-place idea creation and suggestion generation have the corresponding guards. Other legacy undated budget/research/Quick Add paths remain outside general optional-date support; the approved POC now supplies their required date range.

001–009 are unchanged from the previously inspected baseline. No migration file was edited during this finalization check. Neither a missing API column nor an untracked local file proves that 010 has never been applied **anywhere**. No authenticated project-wide history or inventory of other environments is available here. Therefore:

- Do not rewrite 010 again based on an assumption that it is globally unapplied.
- If the administrator confirms 010 was never applied in any environment, the current reviewed local 010 is the intended first application, after verifying prerequisites.
- If an earlier 010 was applied anywhere, preserve that applied revision/history. Stop this application plan and prepare a reviewed forward-only migration from the actual catalog state. Do not invent or apply a generic 011 without those definitions. The already-applied optional-date functions/nullability would not be undone simply by running the revised file.

## Your exact next action — verification only

1. Open **Supabase Dashboard**, select the intended development project and confirm its project reference against Pfew's effective public configuration. Establish whether it contains real user data, is production, or is used by older clients. That status is currently **unverified**. Do not paste credentials or service-role keys into chat.
2. Open **SQL Editor → New query**. Paste the complete contents of [inspect_010_readiness.sql](../supabase/inspect_010_readiness.sql) and run it. This is a read-only metadata transaction, not migration 010. Export each result set privately, without truncating it. It returns constraints, indexes, enabled/disabled triggers, function definitions/owners/search paths/grants, policies, views and default grants. Sanitize any secrets in customized function bodies before sharing results for review. No RLS is disabled or public catalog access enabled.
3. Look at `migration_ledger` in the first result. **Only if it exists**, run this separate verification query:

   ```sql
   begin transaction read only;
   select version,to_jsonb(m)->>'name' as name
   from supabase_migrations.schema_migrations m
   order by version;
   commit;
   ```

   A missing ledger is possible with manual SQL Editor setup; compare actual definitions with 001–009 instead of assuming missing migrations. Do not run a missing-table query inside the other script's transaction. Check the history and environment inventory for any previously applied 010, including old revision names.
4. In a separate SQL Editor query, run [inspect_010_baseline.sql](../supabase/inspect_010_baseline.sql). It returns only aggregate trip/booking counts, missing/reversed date counts, original-field fingerprints and broken relationship counts. It does not export individual trip fields. Retain this baseline privately; do not mistake it for a backup. A timeout is a stop/review condition, not a reason to remove protections or change data.
5. Verify the actual database backup/recovery option in this project, its timestamp, coverage and restore procedure. Confirm that schema, functions, policies and data can be restored; plan entitlement/backup availability is not verified from this workspace. A source-code archive or aggregate counts cannot replace a database backup. If no appropriate recovery option is available, do not apply the migration.
6. Return the sanitized catalog/history results and confirmation of project identity, applied-010 history and recovery availability for review. **Do not run migration 010 yet.** These are the facts needed to move from NO-GO to a project-specific recommendation.

## What the catalog review must establish

- Actual prerequisites through 009: trips/segments and original date/range checks; booking and same-trip segment relationships; destination location columns and timezone functions; `trip_members`/invitations; owner/member RLS and grants; audit and immutable-owner/trip triggers; private-file upload/deletion guards; booking import and research additions.
- `creation_state`/other draft columns, indexes or RPCs already present or partially applied. IF NOT EXISTS does not repair incompatible definitions. Compare types, defaults, checks and function signatures, not only object names.
- The exact definitions/ownership/grants of `can_read_trip`, `can_edit_trip`, `accept_ai_idea`, `validate_segment_dates`, `validate_essentials_link`, `validate_trip_dates` and their dependent triggers. Unexpected custom rules must not be overwritten silently.
- No extra permissive policies, owner-privileged views, old clients or custom queries that expose private drafts. Current owner access intentionally allows reading one's own drafts; older unfiltered trip lists can still display them as ordinary trips.
- Original trip/booking data compatibility and any legacy incomplete date rows. Do not automatically backfill dates or tighten constraints to make inspection pass.

The previously observed 23 successful zero-row probes and missing `creation_state` are **limited API evidence**. They do not certify migration history, full schema, RLS, backups or production/development separation. Privileged catalog access is still unavailable in this workspace; no live counts or metadata SQL scripts were executed here.

## Safe application procedure — only after GO and explicit approval

1. Confirm the reviewed target, migration-history branch and exact file/hash. Verify the backup and establish a quiet write window. Re-run the read-only baseline immediately before application and save its results.
2. If 010 is confirmed unapplied with compatible 001–009 prerequisites, run the reviewed 010 once in the target project's SQL Editor using the file's existing BEGIN/COMMIT transaction. Use reviewed session lock/statement timeouts; do not wrap it in another transaction or remove checks to force success. If an old 010 exists, use only the separately approved forward migration instead.
3. Do not replay the combined 005–009 upgrade after 010: older helper definitions can replace draft-aware authorization. Record the migration using the established history process. Refresh PostgREST's schema cache only if necessary.
4. Before any fixture writes, re-run the catalog and baseline scripts. Original trip/booking counts/fingerprints and relationships should match in the quiet window; newly added draft metadata is intentionally excluded from the trip fingerprint. Check finalized defaults, date constraints, enabled triggers, valid index and intended function/RLS grants. Investigate any mismatch before continuing.
5. Using isolated test accounts, verify valid dated draft save; rejection of missing/partial/reversed dates; two independent drafts; retry idempotence; refresh/browser restart resume; stable IDs; stale-edit conflict; normal finalized-trip visibility; draft exclusion from Home/My Trips/active selection/reminders/offline export; stranger/viewer denial for draft rows/children/RPCs; preserved finalized sharing, booking links and dated itinerary behavior; friendly legacy incomplete-date rejection without lost suggestions.

DDL/index creation can take locks. Actual table size, lock duration, recovery options and custom live policies remain unverified. After commit, prefer a reviewed forward fix; do not drop draft metadata, restore old unfiltered clients, fabricate dates or restore an old whole-database backup over newer writes as a routine rollback.

## Final checks

Passed this turn: `npm run lint`, `npm run typecheck`, `npm test` (298 tests in 68 files), `npm run test:e2e` (56 desktop/mobile cases), and `npm run build`. Both read-only SQL files also passed isolated execution; aggregate fingerprints for a synthetic existing trip and booking matched before/after 010. Browser fixtures use actual components with isolated simulated persistence; SQL/RLS tests use isolated PGlite. These checks do not substitute for the administrator export. No connected migration, real record mutation, deployment, push, merge or Phase 7C work is authorized or performed by this handoff.

Only `supabase/inspect_010_baseline.sql` and this handoff document were added for Phase 7B.2. Application code and migration 010 remain unchanged. Stop for administrator verification and review.
