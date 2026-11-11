> Historical audit of the former optional-date revision. On 10 November 2026 the POC requires both dates; revised unapplied migration 010 no longer loosens date constraints and adds a legacy idea-date guard. Its old hash and reproduced failure below describe the earlier revision. Live catalog/backup verification is still required. See [current acceptance report](PHASE_7B_DRAFTS_ACCEPTANCE.md).

# Migration 010 readiness audit — 9 November 2026

**Recommendation: NO-GO for applying 010 to the connected project yet.** The repository migration works against its expected schema in isolation, but the connected project's complete definitions and security rules could not be inspected with the available public application key. Nullable-date compatibility also has a confirmed gap. Nothing was applied to the connected database; no application code, existing migration, data, environment setting, or external service configuration was changed.

## Actual connected-project evidence

Used the same public Supabase configuration fallback as `next.config.ts` / `lib/deployment-config.ts`. No database connection credentials, management token, Supabase CLI link, or database inspection connector were available. The configuration alone does not establish that this project is dedicated development infrastructure; its environment and separation from older clients need confirmation.

All remote requests were GET requests, with `limit=0` for table checks. No RPC was invoked, no account was signed in or changed, and no trip, booking, document, or account contents were retrieved.

| Read-only check | Observed result | What it establishes |
| --- | --- | --- |
| All 23 existing setup probes, including booking imports, membership and research fields | HTTP 200, empty arrays as requested | Expected baseline table/column names were accepted by the API. |
| `trips.creation_state`, zero rows | HTTP 400, PostgreSQL code `42703` | The API reports the new draft column as absent. Catalog access is still needed to rule out schema-cache disagreement or partial setup. |
| API OpenAPI/schema endpoint | HTTP 401 | Full API metadata unavailable to this request. |
| Catalog query using `Accept-Profile: pg_catalog` | HTTP 406, `PGRST106` | PostgreSQL catalogs are not exposed by this Data API. Do not expose them publicly to work around this. |

Zero-row probes do **not** establish row counts, successful RLS isolation, column constraints/types, indexes, function bodies/ACLs, triggers, backup availability, or migration execution history. No claims about actual existing trip contents are made.

The missing evidence can be supplied through a securely configured read-only PostgreSQL connection or a catalog export from the intended project's SQL Editor. The prepared [read-only inspection script](../supabase/inspect_010_readiness.sql) checks tables, columns, constraints, incoming foreign keys, indexes, triggers, function definitions/ownership/grants, RLS policies, views, role flags and default grants. It selects no application records. Keep exports private and sanitize secrets if custom function bodies contain them. No service-role key should be pasted into chat. An ordinary signed-in app session alone is insufficient for a complete catalog/security audit.

## Migration ordering and preservation

Read all migrations 001–010, the Phase 7B acceptance report, relevant application queries, and the upgrade instructions. The combined `upgrade_phase2_to_phase4.sql` matches migrations 005–009 after stripping comments and transaction wrappers.

Expected order: **001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010**. The combined upgrade is an alternative to 005–009, not another prerequisite to replay after 010. In particular, rerunning 006/007 after 010 replaces the authorization helpers with older definitions. A missing CLI migration ledger does not itself mean missing migrations: manual SQL Editor setups may have no ledger. Compare definitions, not only filenames or history.

010 adds four metadata columns and a draft index, makes trip dates nullable, adds draft save/validation/sharing functions and triggers, and replaces four existing functions. It does not delete rows, change trip/booking IDs, change booking foreign keys, change booking dates, modify authentication, or touch Storage bucket settings/files. Existing rows receive `creation_state='finalized'` when that column is first added. Booking and segment dates remain required.

Fresh isolated PGlite checks applied the individual migrations 001–009, seeded a synthetic existing trip and booking, then applied 010 twice. All original trip fields, all booking fields, and pre-existing audit rows were identical afterward; only new trip metadata was added. The existing dated `accept_ai_idea` operation still succeeded. These are reproducible fixture results, not proof that the connected schema has no drift.

`ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` skip existing names without repairing incompatible types, defaults, checks or index definitions. `CREATE OR REPLACE FUNCTION` can overwrite customized logic while retaining existing ownership and grants. These are reasons to inspect actual definitions before approval. Confirm function owners can safely implement the intended SECURITY DEFINER helpers without RLS recursion, and review any extra permissive policies or owner-privileged views.

## Draft visibility and authorization

The current application uses `lib/finalized-trips.ts` to filter Home and shared shell/My Trips queries by `creation_state='finalized'`. Client sorting, active-trip selection and shell options also exclude drafts. Owned direct dashboard links redirect to creation; foreign drafts remain inaccessible. Normal offline export rejects drafts.

010 limits membership-based `can_read_trip` / `can_edit_trip` access to finalized trips and blocks draft invitations/memberships. Existing child policies using these helpers inherit that restriction. The isolated tests pass for owners, collaborators, strangers, repeated saves, stale revisions and even an accidental privileged draft membership. Existing uploader-private document rules are retained.

This does **not** mean every raw trip query automatically excludes drafts: an owner must still be able to read their own drafts. Old clients or unfiltered custom views/queries can show that owner's drafts as ordinary trips. Verify this development project is not shared with an older client, and retain the Phase 7B filtering code after migration. Unexpected live permissive policies could defeat privacy; the current public API cannot prove they are absent. Service/admin roles intentionally bypass ordinary user RLS and must never be used as browser credentials.

## Confirmed nullable-date gap

`supabase/migrations/006_trip_intelligence.sql:76–82`, `accept_ai_idea`, inserts both segment dates from `trip.start_date`. 010 makes that value nullable but leaves segment dates NOT NULL. In a fresh isolated database after 010, accepting an idea on an undated finalized fixture failed with **23502: null value in trip_segments.start_date**. No segment was saved. The same operation on a dated trip passed.

Current private drafts are kept away from the normal Ideas dashboard by the handoff route. This is not evidence of damage to existing dated trips, but it prevents a blanket claim that nullable dates work throughout the database. The smallest follow-up is an explicit known-date guard or a user-supplied scheduled date for this operation; never invent one. Do not enable normal dated actions for undated drafts/finalized trips without appropriate guards.

Other date assumptions remain: `app/intelligence-actions.ts` calculates provider duration from both dates; the legacy feature-page header at `app/trips/[id]/page.tsx:125–142` computes a countdown independently even with a missing end date; legacy trip editing still requires both dates. The new Home/overview lifecycle and date presentation are neutral, but full undated functionality outside those paths is not established. These follow-ups were identified, not implemented in this audit.

## What needs to change, including other services

1. **Supabase inspection access/evidence:** obtain the catalog export and confirm the intended development project, complete 001–009 prerequisites, function/trigger definitions, RLS/ACLs and absence of incompatible partial 010 objects.
2. **Date-dependent code/SQL:** resolve or explicitly gate the confirmed undated idea-acceptance path and review the remaining date assumptions before claiming general nullable-trip support. Keep new drafts isolated from those features.
3. **Supabase schema, after GO and explicit approval:** apply only the reviewed 010 (or its approved correction), as one transaction. Do not rerun foundation/upgrade SQL indiscriminately.
4. **Other services:** no evidence calls for Google OAuth changes, another maps/geocoding provider, new API keys, billing changes, Supabase Storage changes, or Vercel deployment. Photon/OpenStreetMap search remains the existing integration. This audit did not run paid provider tests or independently certify every external service.

## Minimal application procedure, only after blockers are cleared and approval

1. Confirm the exact development project and compare the live catalog export with the expected schema. Resolve discrepancies and the nullable-date scope before changing anything.
2. Verify a recent restorable backup covering database schema, policies/functions and data. Save a schema export and a pre-migration aggregate baseline for existing trips/bookings, including IDs and original field fingerprints without exposing contents. Pause local saves during the brief migration check. Ensure older clients are not using this project.
3. Review the exact SQL revision and apply its existing `BEGIN`/`COMMIT` file once in that project's SQL Editor, using appropriate session lock/statement timeouts. Do not add another enclosing transaction around the file. Stop on errors; do not remove checks to force it through. ALTER TABLE locks last until commit, and the ordinary index build can block writes; actual table size and lock duration are unverified.
4. Reinspect the resulting columns, checks, index, functions, triggers, RLS and grants. Refresh PostgREST's schema cache only if needed. Compare existing-record aggregates before creating any fixtures. Record the migration using the project's established history process.

Audited 010 SHA-256: `ff2e3b45fe4cca8590c821c89c046209e8a5a6562be6b202b02f7dd2e705b5bf`.

Rollback: transaction failure should leave the migration unapplied. After commit, prefer a reviewed forward fix; do not drop draft metadata, restore NOT NULL while undated rows exist, or revert to old unfiltered clients. Do not restore an old whole-database backup over new user writes as a routine rollback.

## Post-migration verification, after separate approval for fixture writes

- Re-run the catalog comparison: expected nullable date columns; finalized default; all draft checks, valid partial index and enabled triggers; correct function ownership/security/ACLs; RLS and expected policies still enabled.
- Check existing trip/booking IDs, original fields/counts/fingerprints and relationships against the pre-migration baseline before inserting fixtures. Existing finalized sharing, dashboards and private files must remain available.
- With a dedicated owner test account, create two private fixture drafts; test no dates, departure-only, return-only and both dates. Reject an inverted range, blank name and missing destination.
- Refresh/restart the browser, resume each draft, change/reorder destinations, navigate backward, retry saving, and use two tabs for a stale-edit conflict. IDs must remain stable; drafts must not overwrite one another or reset later progress. Verify failed saves preserve inputs.
- Check Home, My Trips, switcher, explicit Home selection, normal reminders/summaries, direct dashboard URLs and offline export for draft exclusion.
- With a second authenticated account (including an existing finalized-trip collaborator), test draft/child reads and updates, guessed direct URLs and RPC IDs. Expect denial; an existing finalized shared trip must retain its proper editor/viewer behavior. Test signed-out requests separately. Do not test only with an administrative SQL role.
- Test dated existing feature flows and the explicitly approved behavior when dates are unknown, including idea acceptance. No fabricated dates, unhandled NOT NULL failure or misleading countdown should remain in supported paths.

## Checks performed and stop point

Re-ran 59 relevant tests in 10 files successfully, including isolated draft migration/RLS, save actions, creation routes, Home/shell, lifecycle and active navigation. A separate in-memory check tested the individual migration chain, legacy booking/trip preservation, rerun behavior, and reproduced the nullable-date failure. The read-only catalog script also passed isolated syntax execution. No live migration, live write, paid service request, deployment, push or merge occurred.

Only this audit report and `supabase/inspect_010_readiness.sql` were added to the repository for this readiness check. Migration 010 and application code are unchanged. **Wait for review; do not begin Phase 7C or apply SQL.**
