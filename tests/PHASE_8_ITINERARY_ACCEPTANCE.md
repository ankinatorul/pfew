# Phase 8 — Itinerary & AI suggestions

Implemented locally, 10–11 November 2026. No migration application, connected database writes, paid AI calls, environment changes, deployment, push or merge. Earlier uncommitted work was preserved; the pre-phase source checkpoint is `/private/tmp/pfew-before-phase8/source/`.

## 1. Implemented

The existing `/trips/[id]?view=itinerary` now serves a full-width day planner in the approved app shell. `?view=ideas` opens the same planner with Explore ideas expanded; it does not introduce a competing page or route. Home, dashboards, Sidebar, Edit Trip, creation, bookings, budget, packing, map, research and offline implementations remain intact.

- Seven-day moving window with previous/next controls and an in-range date jump. It computes day numbers from real calendar dates without generating a whole long trip. Missing or invalid legacy dates produce a safe explanation, without assigning dates.
- Timed plans in saved local-time order, separate flexible/continuing plans, truthful empty states and loading/error feedback. Individual cards sit directly on the existing off-white canvas. Shared palette, font, radii and navigation are reused.
- Required activity name and date; optional start/end time, free-text place/address, notes, category and explicit saved-destination association. No invented coordinates, place ID or reservation. End time requires a start and must be later on the same calendar day. DST-skipped/ambiguous times are rejected by server validation; elapsed duration across a valid clock change is preserved.
- Create, edit/move, confirm deletion, reorder single-day untimed activities/notes, and explicit completion on or after the scheduled day. IDs stay stable. Completion is separate from confirmation/reservation state. Moving a completed activity to another day clears its completion rather than marking the new day complete.
- Existing multi-day plans, transports, stays and legacy overnight-duration plans remain readable and use the existing detailed editor; this phase does not flatten or truncate them into single-day activities. Existing unscheduled ideas remain discoverable and can be explicitly dated through the activity editor.
- Incomplete saved time intervals are not treated as known-duration plans. The existing schedule engine supplies overlap warnings, capped at five visible warnings. A day with six or more saved items gets a simple count-based breathing-room hint, not a routing or feasibility claim. Optional gaps use actual saved valid interval boundaries. Cancelled bookings are shown but excluded from overlap calculations. Out-of-trip plans are exposed for review, never silently moved.

## 2. Reused infrastructure

Existing trip access/session checks, `tripRole`, owner/editor/viewer RLS, `trip_segments`, bookings and booking links, `ai_suggestions`, `accept_ai_idea`, destination data in `draft_data`, `savedTripDestinations`, `savedSchedule`/`localInstant`/`linkedDateDifferences`, the existing detailed activity editor, `tripSectionUrl`, `travelStyleLabel`, OpenAI provider, usage ledger, `reserve_service`/`finish_service`, audit and immutable-trip triggers, app shell and CSS tokens. No dependencies, new provider, second activity table or new primary route were added.

## 3. Files changed

Existing files:

- `app/trips/[id]/page.tsx` — routes itinerary/ideas into the same planner, with a scoped loading fallback, before the legacy page wrapper.
- `app/layout.tsx` — imports the scoped itinerary stylesheet.
- `app/shell.css` — adds the planner to the existing full-width canvas selector.
- `lib/ai.ts` — extends the existing context and prompt; accepts an honest empty suggestions response. Existing model, transport, quotas and mock provider remain available to their existing callers.
- `playwright.config.ts` — includes the itinerary fixture suite.

New files:

- `lib/itinerary.ts` — pure validation, date window, destination context, day model, duration and bounded AI context.
- `components/itinerary.tsx` — authorized server reads and read-only capability check.
- `components/itinerary-client.tsx` — existing router/action integration.
- `components/itinerary-view.tsx` — responsive planner, activity editor and Explore ideas presentation.
- `app/itinerary-actions.ts` — authenticated validation, mutations, quota reservation and suggestion persistence.
- `app/itinerary.css` — styles scoped to the new itinerary view.
- `supabase/migrations/014_itinerary_planning.sql` — prepared only.
- `supabase/VERIFY_PHASE8_READ_ONLY.sql` — optional administrator before/after report; no application RPCs or writes.
- `tests/itinerary.test.ts`, `tests/itinerary-actions.test.ts`, `tests/itinerary-reader.test.tsx`, `tests/itinerary-database.test.ts` — model, server, compatibility and isolated SQL/RLS checks.
- `tests/fixtures/itinerary-browser.tsx`, `tests/browser/itinerary.spec.tsx` — isolated browser journeys.
- This report and `tests/screenshots/phase8/README.md`, desktop/mobile itinerary captures.

The build-generated `next-env.d.ts` is restored to its pre-phase contents after verification. No existing applied migration 010–013 was rewritten.

## 4. Prepared migration 014

**Not applied to the connected/live Supabase project.** The owner's Phase 7 audit/application is respected; a local migration file is not treated as evidence that 014 is applied.

Additive changes:

1. `trip_segments.itinerary_revision` (nonnegative integer, default 0), `activity_category` (nullable constrained text), `completed_at` (nullable timestamp), `destination_location_id` (nullable text for the already-saved Phase 7 destination identity). Existing UUID `destination_id` continues to link dated destination segments. No stop dates are generated.
2. `ai_suggestions.context` (JSON object, default empty) preserves requested day/destination/style/request identity.
3. `service_usage.itinerary_request_id` and a partial unique index on actor/request ID allow idempotent use of the existing quota ledger.
4. A segment revision trigger increments the revision for real changes, including updates through existing editors, preserves identity, and validates saved-destination association.
5. `change_itinerary(uuid,jsonb)` — security invoker atomic activity operations, explicit authorization, row locks, revision checks and per-trip advisory serialization for the new workflow.
6. `reserve_itinerary_ideas(uuid,uuid)` — a narrow security-definer quota wrapper, explicitly actor/trip authorized, with empty search path and trusted administrator ownership. It reuses existing quota enforcement and cannot publish or edit itinerary items.
7. `persist_itinerary_ideas(uuid,uuid,uuid,jsonb,jsonb)` — security invoker atomic suggestion persistence and quota completion, validates the actor's reservation and prevents duplicate active/saved titles.

Public/anonymous execution is explicitly revoked for the new functions; authenticated execution is granted for the three application RPCs. Existing RLS policies are not broadened or disabled. Existing dates, confirmation status, booking records, attachments and business fields are not rewritten. The isolated before/after report verifies original segment/booking/suggestion fingerprints remain equal. Existing trip fingerprints are separately checked in the database suite.

## 5. Persistence and authorization

Activities use the existing segment rows and stable UUIDs. Create retries reuse the same UUID; matching retries preserve the same row, and concurrent changed revisions return a recoverable conflict. Updates/deletes/completion compare the locked current revision. Reordering validates the complete current set of single-day untimed items, checks every revision and applies changes in one transaction. No activity time is modified by ordering. Confirmation is not inferred; changing a previously confirmed plan's date/time makes that plan planned, without changing its booking.

Owner/editor access is checked again inside SQL and enforced by existing RLS; viewers and unrelated accounts are rejected. Private drafts cannot be planned through the finalized-trip RPC. Trip identity cannot be changed. Existing independent drafts and finalized trip selection remain unchanged.

The new controls are disabled if a read-only zero-row probe finds 014's activity columns unavailable. Existing records remain readable, and the existing editor is linked. Partial booking/idea reads show an error and disable the new edits rather than presenting a false empty day. Activity errors keep the open input and ID. A successful mutation refreshes the existing trip/Home reads; there is no duplicate client trip store.

## 6. Bookings integration

Bookings remain their original records and are shown only where saved date ranges support them. Start times are displayed only on their saved start day; continuing bookings remain context cards with their saved dates and any supplied end information. Unknown times are stated rather than derived. Invalid/missing dates stay in Bookings; unfinished intake entries link there for review. Only genuinely unfinished intake entries count as needing review.

Linked activity/booking pairs use one activity card with linked booking details, even if booking and plan dates differ; date differences are flagged. Review status and reservation status are separate: “Needs review · Reservation confirmed” is possible and intentional. Unlinking clears only `bookings.segment_id`, with a check against the previously seen link. Deleting an activity relies on the existing booking FK's `ON DELETE SET NULL`, preserving the booking and private files. Booking edits use the existing Bookings route and form.

## 7. AI integration and limitations

Explore ideas only calls the existing live provider after an explicit request. If `AI_MODE=live` and the existing server key are unavailable, the UI says so; no fabricated sample replaces live output. Previously stored mock suggestions are explicitly labelled “Sample idea · not live AI.” Provider configuration/key values are never sent to the browser.

The server constructs bounded context from authenticated trip destinations/dates, selected day, approved style label, existing day activities, relevant saved booking titles/categories/times/review state and optional interests. Booking references, attachment data and arbitrary booking notes are excluded. It uses the existing provider/model and quota budget, with no new subscription or paid mapping API. Selecting a style or rendering a page makes no AI request.

Responses are validated with the existing Zod schema, including an honest zero-result response. JSON mode is not treated as schema enforcement; server validation remains necessary, consistent with the [official OpenAI structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat). No new model or SDK migration was undertaken.

Suggestions persist separately until an explicit **Add to itinerary** action. The chosen day is shown before adding; the result is untimed and planned, never confirmed. Atomic acceptance reuses `accept_ai_idea`, then schedules its same stable segment ID within the same transaction. An error rolls back the acceptance. Duplicate clicks return the existing accepted ID and do not move it to another day. Dismissals persist. Original suggestion/context stays linked for provenance. Repeated active/saved titles are filtered when saving a generated set.

Generation request UUIDs reserve quota once. A retry for an existing request never calls the paid provider again: completed results are restored, reserved requests report uncertainty, and failed requests require an explicit new search. If the server stops after the provider responds but before saving, its in-memory response cannot be recovered; the existing reserved request remains visible as uncertain and no automatic extra charge is attempted. A new search can incur another provider request and requires the user to click again. This phase does not add a background job/lease system.

No retrieval, verified venue database, ticket availability or routing is connected to this provider. Accordingly, cards show supplied title/note/category/context, without invented price, duration, opening hours, availability or precise travel time. These are unverified planning ideas, not researched recommendations. No real paid generation was performed during QA; provider behavior was mocked.

## 8. Travel style

Existing stored Budget / Comfort / Luxury values map to Budget / Balanced / Premium. The prompt conditions planning preferences on this existing label. It does not claim independently verified affordability or premium venue quality. Trip monetary budget, expenses and confirmed bookings are unchanged. Editing style remains the approved Edit Trip flow.

## 9. Verification

- `npm run lint` — passed, zero warnings.
- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — 357 tests in 82 files passed, including five new isolated SQL/RLS cases and the read-only before/after report. An earlier interrupted run suffered wall-clock timeouts; the complete controlled rerun passes without increasing test timeouts.
- `npm run test:e2e` — all 82 mobile/desktop cases passed. After the final booking-copy and suggestion-button refinements, the eight itinerary cases passed again.
- `npm run build` — passed; final source validated with a fresh production build.

Coverage includes empty/legacy-date trips, long date windows, required name/date, optional times, invalid/reversed/DST times, real elapsed duration, ordered/unallocated destinations, explicit association, manual create retry, edit/move/reorder, stale revision rejection, cancellation/deletion, linked-booking preservation/unlinking, review distinctions, completion and its date restriction, owner/editor/viewer/stranger access, private draft rejection, saved idea failures/retries/dismissal, no automatic AI/mock fallback, travel styles, quota retries, refresh persistence, migration compatibility and 320/375/768/1440px overflow checks.

Database tests use PGlite with real schema, functions, triggers, roles and RLS. Browser tests bundle the actual planner and approved shell with isolated simulated persistence, not live Supabase authentication. They exercise keyboard focus, accessible controls, touch layouts and error recovery. They do not certify live credentials, real provider output, live storage policies or production network conditions. No test creates or deletes a real trip.

## 10. Screenshots

See [the screenshot gallery](screenshots/phase8/README.md): desktop and mobile captures of the actual new planner inside the approved shell, with fictional isolated records. Full-page mobile captures include the existing fixed bottom navigation at its viewport capture position. No live trip photographs, fictional moodboard data or new decorative imagery were added.

## 11. Known limitations

- New writes require reviewed migration 014; until applied by the owner, the new page remains a readable itinerary with the existing editor available. No application-side flag bypasses that dependency.
- New editor supports single-day, same-zone activities; multi-day/overnight legacy plans keep the existing detailed editor. The UI does not create a separate segment for booking arrivals/check-outs or infer stop allocation.
- Destination context is inferred for a day only when exactly one saved dated destination segment covers it. Ordered Phase 7 destinations without dates are displayed in order but never allocated to days.
- Six-item busy-day hint is a transparent heuristic. Gaps/overlaps use known intervals only and do not represent travel feasibility. Timed ordering uses saved local times with each time zone visible, not a new cross-zone route optimizer.
- New operations serialize with each other; existing legacy endpoints still use their existing transaction/validation behavior. The new revision trigger detects subsequent legacy row edits, but this phase does not rewrite every old action into the new RPC or add cross-workflow parent-date locking.
- No live end-to-end write/paid-provider tests were run. The new migration and privileged quota wrapper still require administrator review in the owner's intentionally shared live project.

## 12. Developer handoff — review before any live change

The existing 010–013 files are already reported applied by the owner. **Do not reapply or edit them as part of Phase 8.**

1. Review `supabase/migrations/014_itinerary_planning.sql`, particularly the new RPC grants, invoker checks and quota wrapper owner. Confirm the intended project and verified backup/recovery procedure already agreed for this live database. A source checkpoint or aggregate fingerprint is not a database backup.
2. Optionally copy all of `supabase/VERIFY_PHASE8_READ_ONLY.sql` into one new SQL Editor query and run it. It is read-only, returns one `phase8_report`, and works before/after 014. Save the report privately. Before application, missing 014 columns/functions are expected; existing prerequisites, original baseline counts/fingerprints, triggers and broken-link count still matter.
3. The supplied migration has been tested locally against 001–013 fixtures. Review any custom live definitions before accepting additive names or `CREATE OR REPLACE`; `IF NOT EXISTS` does not repair an incompatible pre-existing column/index. Verify authenticated existing RLS/grants; do not bypass them.
4. Apply **only after explicit approval** using the established migration process and the reviewed file's transaction, during an appropriate quiet write window. Record it in the project's migration history/process. No migration application is authorized or performed in this phase.
5. Re-run the read-only report before enabling edits. Expect six columns, four functions, the enabled `itinerary_revision` trigger and valid `itinerary_service_request` index; anonymous execution must be false. The quota wrapper must have a trusted administrator owner, security definer and empty search path; the two mutation/persistence RPCs must be security invoker. Original baseline fingerprints/counts should match within a quiet window, and broken booking links must remain zero. In a busy live database, investigate legitimate intervening writes rather than assuming all count/hash differences are migration damage.
6. Confirm the new controls enable on localhost. Use only owner-approved isolated fixture records for any subsequent manual write smoke test. Verify create/refresh/edit/move/order, one suggestion acceptance/dismissal, and shared-role behavior. Never delete a real trip to test this feature. Existing bookings/attachments and approved screens must remain accessible.

Expected function body MD5 fingerprints for this prepared version (for comparison with `pg_proc.prosrc`, not a substitute for source/security review):

| Function                                              | Body hash                          |
| ----------------------------------------------------- | ---------------------------------- |
| `itinerary_revision_guard()`                          | `f2f1dc17d44db59ac8b71c6a1d7a97ff` |
| `change_itinerary(uuid,jsonb)`                        | `73c1733984e2601ea53e783039479e4f` |
| `reserve_itinerary_ideas(uuid,uuid)`                  | `550f3dadb46392ced75bc475d536b152` |
| `persist_itinerary_ideas(uuid,uuid,uuid,jsonb,jsonb)` | `292be9826e8e9583dfb2c78574186aa2` |

## 13. Recommended next phase

Review Phase 8 and its screenshots, then separately review/approve the database dependency. After that, perform an authorized manual smoke check in the existing project. Any next product phase should be explicitly chosen after this review; no Phase 9 implementation or redesign of other modules was started.
