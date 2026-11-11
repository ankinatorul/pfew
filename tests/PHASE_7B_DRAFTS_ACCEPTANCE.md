> Connected-project follow-up: Supabase explicitly grants anonymous function execution by default. A forward-only companion **011_explicit_draft_rpc_permissions.sql** is now prepared to make draft/idea RPC execution authenticated-only. It preserves 010 unchanged. Neither has been applied by this task. See [current review](CONNECTED_SUPABASE_FOLLOWUP_REVIEW.md).

# Phase 7B — private drafts with mandatory POC dates

Current decision: **10 November 2026**. Both trip dates are mandatory before saving a server draft or continuing to Step 2. This supersedes Decision 15 and the former optional-date requirements. The earlier audit is retained as historical evidence, not current product behavior.

## Implemented behavior

- Step 1 requires a trimmed trip name, at least one resolved destination (up to 32 ordered stops), a valid start date and a valid end date on or after the start. Same-day trips are valid. Both date inputs are marked required; the return input also has the start date as its minimum. Client validation and the authenticated server action reject missing, partial, invalid and reversed ranges. Continue shows validation feedback and never saves or advances invalid input.
- Removed the optional-date helper text. Current copy: “Choose both dates to continue. You can edit them later.” No date picker or extra wizard was added outside the existing Step 1 inputs.
- Existing private drafts, stable IDs, revision protection, multiple destinations, add/remove/reorder, local recovery, Resume / Start New, and honest save failures remain. Name, destinations, dates and incomplete search text can be recovered locally even before all required fields are valid. Incomplete browser entries are not represented as server-saved trips.
- Existing incomplete server drafts remain readable and editable. The route validates saved basics before showing the Step 2 handoff, even if an older record claims progress 2 or a user opens the handoff URL directly. Missing dates stay blank for correction; no new ID or guessed date is introduced.
- Step 2 remains the private-draft handoff, not a completed bookings implementation. The existing date-required complete-trip form remains available through the existing compatibility link. Phase 7C was not started.
- Reused worldwide Photon/OpenStreetMap destination search and its existing canonical resolver. Provider identity, labels, coordinates, timezone and order are preserved. No provider, key, billing, authentication or Storage change.

## Exactly what migration 010 now contains

**010 is still required for private drafts.** It is no longer an optional-date migration. The revised, unapplied file contains:

1. `creation_state` (default finalized), `draft_data` (ordered canonical destination metadata), `draft_step` and `draft_revision` on the existing trips table, with their checks.
2. A partial owner/last-edit index for private draft listing.
3. Revised `can_read_trip` / `can_edit_trip` helpers so membership only grants access to finalized trips. Owner access and finalized sharing remain. Existing child-table RLS still applies.
4. Draft validity and state-transition triggers, including required start/end dates for draft saves, and triggers blocking draft membership/invitations.
5. The invoker-security atomic `save_trip_draft` RPC: required ISO dates, stable-ID retries, row locking, owner RLS, revision conflicts, preserved future metadata/progress, and no automatic publication.
6. A backward-compatible replacement of `accept_ai_idea(uuid)` with the same signature, authorization, atomic insert/update and idempotence. Incomplete legacy dates produce `IDEA_DATE_REQUIRED` before any insertion instead of an unhandled NOT NULL failure. Its execute permission remains authenticated-only.

**Removed from 010:** both `DROP NOT NULL` alterations and replacements of `validate_segment_dates` / `validate_essentials_link` that relaxed range checks for missing trip bounds. The original NOT NULL constraints, ordered date checks, segment and budget-allocation bounds, foreign keys, bookings and private-file behavior stay intact on a normal 001–009 schema. No `SET NOT NULL`, repair UPDATE, data deletion or automatic rollback was added.

Revised 010 SHA-256: `2082f22aa227cf0965fd4b22477e4ee00cfed3f59559926f1764729e7b3a8c6a`.

If an earlier nullable revision was already applied elsewhere, running this revised file does **not** restore its former NOT NULL constraints or undo previously relaxed functions. Inspect that environment first and plan a separate reviewed correction if needed. Do not modify existing dates or reverse schema changes automatically.

## Legacy compatibility and suggestion acceptance

Legacy records may still have missing dates. Nullable fields remain readable in the draft parser; existing Home/overview neutral lifecycle/date guards are preserved. Existing valid trip lifecycle behavior is unchanged.

`acceptSuggestion` now checks the saved trip dates before calling the RPC; `placeToIdea` uses the same guard. An already accepted suggestion remains idempotent. Fully dated trips retain the existing behavior: save an unscheduled idea segment at the known start date, without marking it planned or creating a reservation. Legacy missing, partial, invalid or reversed ranges receive a friendly instruction to complete the dates in Edit trip. Suggestions and saved places are not dismissed, deleted or changed on failure. Trip dates are never changed automatically. No additional date-selection flow is introduced for normal POC trips.

The SQL guard in 010 protects direct RPC callers after the migration is explicitly approved and applied. The application guard works with the existing RPC before that application. Suggestion generation also rejects incomplete legacy dates before reserving a service request or sending invalid duration context to a provider.

Other findings, outside this focused change: legacy Quick Add/manual segment forms and date-based budget/research controls still assume a known date range, and legacy feature-page headers compute a countdown independently of the neutral overview helper. New POC trips satisfy those assumptions. These paths have not been redesigned or certified for arbitrary legacy undated trips; no broad optional-date support is claimed.

## Verification

Passed `npm run lint`, `npm run typecheck`, `npm test` (**298 tests in 68 files**), `npm run test:e2e` (**56 desktop/mobile cases**) and `npm run build`. TypeScript initially encountered byte-identical duplicate generated files (`.next/types/* 2.ts`); those copies were moved to the temporary checkpoint directory and the check passed with canonical generated files unchanged. No real trip, account, booking or file was created, edited or deleted. No paid provider request was made. No Supabase migration was applied to the connected project.

Regression coverage includes:

- Required names/destinations and both dates; neither date, departure-only, return-only, invalid calendar dates, reversed order and same-day validity.
- No server save/Step 2 advancement on invalid input; date-required HTML attributes and removed optional copy.
- Worldwide multi-destination order/identity, local incomplete-input recovery, failed saves, multiple drafts, Resume / Start New, stable-ID edits and retries.
- Legacy incomplete drafts returning to Step 1 instead of bypassing validation through saved progress.
- Migration rerun safety, unchanged original trip and booking fields, original date NOT NULL flags, unchanged finalized visibility/collaboration, owner/stranger child RLS and stale-revision protection.
- An isolated simulated already-nullable legacy schema remains nullable after revised 010; incomplete records are not repaired or removed. Undated/start-only/end-only idea acceptance fails with the friendly guard, preserves the suggestion and creates no segment. Completing dates explicitly permits the same suggestion to be accepted idempotently. Fully dated ideas retain existing behavior; unauthorized callers are denied.
- Application validation/network failures preserve suggestions/places and do not mutate dates; incomplete legacy dates do not reserve a paid request.
- Existing approved dashboard, navigation, trip editing, itinerary, search and offline browser regressions.

Browser tests render actual components with isolated simulated saves and search results. RLS and migration behavior run in isolated PGlite. They do not substitute for privileged inspection of the actual Supabase project.

## Files changed for this POC requirement update

- `lib/trip-drafts.ts`: required Step 1 date schema; readable legacy draft dates.
- `components/trip-basics.tsx`: required date inputs, range hint and updated copy.
- `app/trips/new/page.tsx`: validate saved basics before the handoff.
- `supabase/migrations/010_private_trip_drafts.sql`: private-draft-only schema changes, required-date save guards and legacy idea guard.
- `lib/idea-dates.ts` (new), `app/intelligence-actions.ts`: shared legacy guards for accepting ideas, saving places as ideas and generating suggestions.
- `tests/trip-drafts.test.ts`, `tests/trip-draft-actions.test.ts`, `tests/trip-drafts-database.test.ts`, `tests/create-trip-route.test.tsx`, `tests/browser/trip-basics.spec.tsx`, `tests/idea-dates.test.ts` (new): regression coverage.
- `PRODUCT_SPEC.md`, `PHASE_7A_CREATE_TRIP_AUDIT.md`, `tests/MIGRATION_010_READINESS.md`, this acceptance report: current decision and historical-audit notices.

## Administrator verification, backup and application plan

**Still NO-GO for the connected project until its actual metadata and recovery option are verified.** No privileged connection is available in this workspace. The prior GET-only checks accepted all 23 legacy column probes and reported `creation_state` missing; these are prior API observations, not proof of today's catalog, complete migrations, privacy, backups, or development-only status. Do not assume this project has no real users or is isolated from older clients.

1. In the intended development project's Supabase Dashboard, confirm project identity/environment and whether it contains real user data or is used by other clients. Treat that status as unverified until an authorized administrator confirms it. Do not expose service-role keys or database passwords in chat.
2. An authorized administrator should run/export [inspect_010_readiness.sql](../supabase/inspect_010_readiness.sql) in SQL Editor. It uses a read-only transaction and inspects tables, constraints, indexes, triggers, function signatures/security/grants, policies, views and incoming foreign keys. Read the optional migration-history query only if the ledger exists; manual SQL Editor setup may have no CLI ledger. Compare actual definitions with migrations 001–009 and the revised 010, including existing NOT NULL flags and any customized functions/policies. Do not enable public catalog access or disable RLS.
3. Verify an appropriate restorable backup/recovery option, its timestamp and restore procedure. Include schema/functions/policies and data; an untested source archive or unknown plan entitlement is not a verified database backup. Before approved application, record read-only aggregate baselines using the same authorized administrative context and a quiet write window:

   ```sql
   begin transaction read only;
   select count(*) as trips_before from public.trips;
   select count(*) as bookings_before from public.bookings;
   commit;
   ```

   Also retain private ID/original-field fingerprints or a trusted snapshot for preservation comparison; counts alone do not prove unchanged data. Do not export personal trip contents into chat. No counts or privileged queries were executed against the connected project in this task.
4. After a GO review and **explicit approval**, apply only the reviewed 010 as its existing transaction, with suitable lock/statement timeouts. Do not replay older migrations blindly: 006/007 can replace the newer authorization helpers. A partially existing schema must be compared, since IF NOT EXISTS does not repair incompatible definitions. Record the applied revision using the established migration-history process.
5. Check actual columns/checks/indexes/function grants, enabled triggers and RLS after application; refresh PostgREST schema cache only if needed. Compare original trip/booking IDs and fields/counts against the backup/baseline before any fixture writes. Then use isolated test accounts to verify valid dated draft saves, invalid-date rejection, reload/restart recovery, independent drafts/retries, cross-account denial, normal finalized views, neutral legacy display, and existing dated suggestion/itinerary behavior.

Rollback after commit needs a reviewed forward fix. Do not drop private draft metadata, restore old unfiltered clients or apply NOT NULL to an already-nullable environment with legacy incomplete data without a separate plan.

No deployment, push, merge, migration application, environment or backend-data change. Stop here for review; Phase 7C is not implemented.
