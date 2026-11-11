# Pre-departure trip dashboard — Phase 4

The existing `/trips/[id]` overview (including `?view=hub`) uses the new dashboard before the trip starts, based on the saved trip timezone. Valid during-trip and past-trip overviews retain their previous implementation. Itinerary, bookings, packing, documents, budget, and the other existing section routes retain their data operations and interfaces.

## Files changed

Created:

- `lib/trip-overview.ts`: read-only summary, defensively formatted dates, deterministic suggestions, and matching against existing Trip Check decisions.
- `components/trip-overview.tsx`: user-scoped server reads, reuse of existing task/finding controls, and composition of the new overview.
- `components/trip-overview-view.tsx`: data-driven presentation on the full-width canvas.
- `components/trip-overview-controls.tsx`: accessible Radix trip-actions menu and explicit dismissal through the existing `decideFinding` action.
- `app/trip-overview.css`: styles scoped to the upcoming overview and its menu.
- `tests/fixtures/trip-overview.ts`, `tests/trip-overview.test.ts`, `tests/trip-overview-view.test.tsx`, `tests/trip-overview-route.test.ts`, and `tests/browser/trip-overview-layout.spec.tsx`.
- This review guide.

Modified:

- `app/trips/[id]/page.tsx`: a guarded upcoming-overview branch before the original rendering path.
- `app/layout.tsx`: import the scoped overview stylesheet.
- `app/home.css` and `app/shell.css`: move Home's existing canvas-width rule into one shared selector for Home and the trip overview. Home's computed layout and the sidebar remain unchanged. No page-level outer card or restrictive overview maximum width is introduced.
- `playwright.config.ts`: include overview browser checks.

Reused: `access`, Supabase/RLS, `tripRole`, `lifecycle`, `departureCountdown`, `days`, `checkTrip`, `visibleFinding`, `prepStarter`, `normalizedTitle`, `budgetSummary`, `workspaceTripSections`, `tripSectionUrl`, `Toggle`, `decideFinding`, existing Button/Radix/Lucide primitives, bundled Manrope, and shared design tokens. No new dependencies, migrations, APIs, authentication behavior, or provider requests were added.

## What the overview means

- Saved incomplete tasks are labeled **Saved task**. Owner/editor completion submits the existing action; rendering never completes a task. Viewers receive no mutation controls.
- **Suggested action** is an optional observation or checklist prompt. Accommodation/transport wording describes missing saved information, not an unbooked or invalid reservation. Evidence and uncertainty are available under “Why this suggestion?”. Existing task topics/titles suppress duplicate suggestions, including completed tasks.
- Current deterministic findings are compared with previously saved fingerprints and decisions. Handled or snoozed evidence remains hidden until the existing reminder rule permits it. A render does not save a Trip Check run.
- Dismiss appears only for a matching saved Trip Check finding and only for an editor/owner. It uses the existing persistence/action and therefore opens Trip Check after saving. Fresh findings can be saved through a deliberate Trip Check run. Packing/document starters use their existing review workflows; their dismissal is not stored and no browser-only persistence is faked.
- Documents reads only the current uploader's `state` values, scoped to this trip. It does not read filenames, storage paths, document contents, or another traveler's private metadata. Ready and pending counts do not imply a document-review status; that field does not exist.
- Booking counts distinguish saved records from user-confirmed records. Itinerary counts exclude destinations, stays, and unscheduled Ideas from dated-plan totals. Packing reflects actual item states. Budget reuses existing currency-specific planned/prepaid/actual accounting, without conversion or double-counting.
- Failed reads are labeled unavailable and do not become fabricated zero counts or reservation gaps. A missing Trip Check decision read suppresses those inferred findings so dismissed evidence cannot silently reappear.

## Local review

Keep `npm run dev` running and open an upcoming trip from My Trips. No SQL or environment edits are needed. The app uses the existing configured backend; use suitable disposable records for manual mutation checks.

1. Existing bookings: saved accommodation covering the trip should not produce a saved-stay gap. Booking/module counts and amounts should match their existing sections.
2. No bookings: empty labels say no bookings are saved. Suggestions explain that arrangements may already exist elsewhere. No booking or itinerary item is created by loading the overview.
3. Saved tasks: check priority/date ordering, up to three visible open tasks, the all-tasks link when needed, and explicit completion/reload. Completed tasks must not reappear as duplicate starter suggestions.
4. Findings: dismiss a previously saved finding and rerun/reload to confirm the matching decision is respected. Confirm fresh suggestions do not offer a fake persistent dismissal.
5. Permissions: use owner/editor/viewer accounts. Only the owner sees Trip settings. Editors can complete tasks and dismiss saved findings. Viewers retain module/tool links without mutation controls. Verify with a real second account; CSS visibility is not the authorization boundary.
6. Dates: known dates show actual duration/countdown. Missing or partial dates have explicit unknown states, without `NaN`, invented duration, or guessed dates. The current database/creation form requires dates, so undated states are defensive render fixtures, not a newly supported creation workflow.
7. Navigation: check Overview, Itinerary, Bookings, Packing, Documents, Budget, plus Map, Trip Check, Research, People, and Offline. A valid selected itinerary day is preserved; invalid/out-of-range days fall back to the saved start date.
8. Layout: verify 320/375/768/1024/1440/1920/2560px widths, long names, keyboard access to Trip actions and Escape/focus restoration. Cards sit directly on the off-white canvas with normal shared gutters. Check that Home and during/past overviews have not changed.

## Verification and limits

Run `npm run lint`, `npm run typecheck -- --incremental false`, `npm test`, `npm run build`, and `npm run test:e2e`.

Completed locally for this phase: lint passed; TypeScript passed; 59 unit-test files / 232 tests passed; production build passed; 26 browser tests passed. Browser coverage includes the existing Home/navigation/auth/offline checks and the new upcoming-trip cases. Read-only localhost checks returned HTTP 200 for `/` and `/login`, without Offline Reader content. The development server remains running on port 3000.

Captured previews (isolated test records, never inserted into Supabase):

- Desktop: `test-results/trip-overview-layout-upcom-f84f0--and-five-real-module-links-desktop/trip-before-departure.png`
- Mobile: `test-results/trip-overview-layout-upcom-f84f0--and-five-real-module-links-mobile/trip-before-departure.png`

Unit tests cover summaries, no-booking uncertainty, persistent decisions, deduplication, missing dates, currencies, explicit action delegation, role controls, uploader scoping, unavailable states, and lifecycle/section routing. Browser checks use the real presenter and CSS with isolated synthetic records; screenshots are saved under the ignored Playwright output directories. Menu keyboard and mutation delegation checks use the actual controls in component tests. No private Google browser session is borrowed and no real Supabase data is written by these checks.

Remaining limits: suggestions cannot verify arrangements outside Pfew; document review status is not tracked; generic unsaved suggestions have no persistent dismissal; fresh authenticated cross-account save/reload acceptance remains manual. Existing legacy hub-card preferences are retained without migration or overwrite; the new upcoming overview presents the five required modules in its fixed layout.

## Rollback

A file-hash-verified pre-Phase-4 source/Git archive is at `/private/tmp/pfew-before-trip-overview-20261106T143953Z/workspace.tar.gz`, with a manifest alongside it. It preserves the original tracked/untracked work and private configuration, excluding generated dependencies/build output. Restore into a new empty directory and compare files rather than resetting this workspace. Keep the checkpoint private. Duplicate generated Next route/validator type copies encountered during verification were preserved separately inside that checkpoint directory before being removed from generated build output; no application source was discarded.
