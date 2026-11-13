# Phase 11A — Unified booking experience

Implemented locally on 13 November 2026. No migrations, live-data writes, deployments, pushes or merges were performed. The earlier uncommitted destination-search correction and unrelated duplicate test file were preserved.

## Entry-point audit

| Entry point                                                 | Previous behavior                                                   | Result                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/trips/new?draft=…&step=2`                                 | Approved upload/manual options, compact cards and drawer            | Same UX; now composed from shared components                                                        |
| `/trips/[id]?view=bookings`                                 | Inline full booking form and a separately toggled legacy collection | Persistent shared upload/manual options; shared compact cards and drawer                            |
| Saved booking Review / Edit, including `&edit=<booking-id>` | Expanded form with category dropdown and internal associations      | Same drawer and four icon pills; explicit checkbox for checking previously unreviewed saved details |
| Existing-trip pending/uploaded collection                   | Inline detailed editor and paste-text section                       | Shared drawer/cards; no paste-text field or full legacy form                                        |
| `/trips/[id]?view=import`                                   | Separate preview/import workflow                                    | Authenticated trip route redirects to canonical Bookings                                            |
| Old day/add-plan import link                                | Pointed to old import screen                                        | Points directly to Bookings                                                                         |
| Home, dashboards, itinerary and document booking links      | Canonical Bookings or `&edit=` links                                | Continue to reach the unified screen/editor                                                         |
| Legacy `BookingForm` / `BookingImport` exports              | Competing full editors                                              | Compatibility links only; no legacy forms or extraction requests                                    |
| Booking-detail file attachment                              | Separate plain file input                                           | Shared upload-area component, retaining the original single-file attachment action                  |

The unused full `components/booking-fields.tsx` renderer was removed after checking production and test references. Generic essentials forms and backend extraction/import helpers remain for other features and compatibility. There is no user-facing booking-type dropdown editor; existing list filters remain filters.

## Shared components and presentation

`components/shared-booking.tsx` contains `BookingOptions`, `BookingUploadArea`, `BookingCard` and `BookingEditor`. Both contexts reuse `BookingDrawer` and `SimpleBookingFields`, including four native type radios, contextual inputs, payment radios, optional deadlines, authorized confirmation links, fixed Save footer and scrollable field body.

Desktop options sit side by side; mobile options stack. The existing 480px drawer becomes full-screen on mobile. Native dialog focus containment, Escape/backdrop/close protection, focus return, viewport sizing and safe-area behavior are retained. Native radios cover their full pill touch targets and retain visible focus indication. Older money-page styles exclude shared booking controls so the same components keep their Create Trip appearance. No new page wrapper, sidebar or dashboard redesign was introduced.

Compact cards show available date/cost/payment information, a type icon, a clickable title and one Needs review badge where applicable. Existing-trip cards retain reservation status independently. Secondary menus contain review/edit, details, confirmation access and confirmed removal. Read-only details remain discoverable; they contain no competing booking editor.

## Persistence and preservation

- Create Trip and owners adding to finalized trips reuse `BookingCollection` and the existing `/api/booking-collection` operations. Stable entry IDs, revisions, upload receipts, unfinished entries, retry guards, finalization and owner-private intake remain unchanged.
- Existing saved records reuse `saveManagedBooking` → `save_managed_booking`, the same booking ID and finance revision. Authorized shared-trip editors use this adapter; owner-private intake/upload access is not widened to collaborators. Viewers remain read-only.
- The existing collection can retain name-only/undated entries as Needs review. Normal materialized booking date constraints remain intact; no trip dates are substituted. An incomplete saved reservation produces a friendly date error and retains editor input.
- `managedBookingEntry` is a presentation adapter, not a second persistent booking store. Simplified fields overlay existing values and preserve unchanged flight/ferry/car-rental subtypes.
- Simplified managed saves load the existing row under RLS, check its revision, preserve authoritative hidden provider, notes, travelers, paid amount, reservation status, itinerary association and unchanged geographic metadata/time zones. Unchanged legacy place identifiers are not re-resolved or erased. New selections still use existing location normalization.
- Editing saved records preserves review status unless the user explicitly checks “I’ve reviewed these details.” Reviewing never confirms a reservation. Existing intake review continues through its established reviewed/unfinished workflow.
- Closing dirty Create Trip editors retains page-local edits with the existing Continue save behavior. Closing a dirty existing-trip intake explains how to reopen and save it. Closing a dirty saved-record editor requires confirmation to discard. Failed requests retain fields; synchronous guards prevent duplicate submissions; dirty editors protect browser unloading.
- Existing attachment IDs, private access routes, itinerary rows and expense relationships are preserved. No file is moved or duplicated by opening an editor.

## Uploads, extraction and Budget

The same upload component supports drag/drop and browse alternatives. Primary collection surfaces accept multiple PDF/JPEG/PNG files up to 3 MB each, processed sequentially by the existing service. The secondary “attach to this saved booking” action remains single-file, matching its existing backend contract.

Successful originals remain accessible after extraction failures. Failed storage remains an unconfirmed upload with retry controls; it is never described as a saved original. Consented extraction, configured-provider availability, source evidence, request limits and manual correction remain in the existing pipeline. Opening or editing a booking does not trigger extraction or paid AI.

Paid / Pay later / Not set map to existing payment states. Historical partial-payment information remains available as a legacy option. Price and paid amount are not recorded expenses. No editor creates expenses, changes currency conversion or adds booking prices to actual-spending totals. Existing expense-only, per-currency Budget calculations and optional booking links are unchanged.

## Migration prepared — not applied

`supabase/migrations/018_unified_booking_editor.sql` is forward-only and requires the existing 010–017 prerequisites. Earlier applied migrations were not rewritten.

It changes only:

1. The existing invoker `save_managed_booking` function: updates populate the locked original record before overlaying supplied fields, and inserts/updates persist the `payment_due_date` column introduced by 017. The same authorization, finalized-trip condition, advisory lock, finance-revision check, record ID and RLS remain.
2. A read-only authenticated `managed_booking_editor_version()` capability marker returning `1`. Anonymous/public execution is revoked for both application functions, with authenticated execution explicitly granted.

No columns, date constraints, policies, buckets or original records are changed by applying 018. No new booking backend or replacement materializer is introduced. Existing 015 silently ignores managed deadline fields; the new capability gate prevents that false-success behavior. Without 018, existing-record deadline controls are disabled and their saved value is omitted from the request so ordinary edits preserve it. Intake deadlines still depend on 017.

`supabase/VERIFY_UNIFIED_BOOKINGS_READ_ONLY.sql` inspects both function signatures, owners, security modes, grants, search paths and source fingerprints without calling application functions or selecting personal booking rows.

Developer handoff: review 018 and the current live schema, confirm the previously outstanding recovery/permission findings, and obtain explicit approval before applying it. Keep 010–017 untouched. Export the read-only verification before/after application and compare the expected 018 definitions. Refresh the app after review. Application of 018 was neither performed nor authorized as part of this task.

## Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **427 tests in 96 files passed**. The final narrower migration test passed again after removing an unnecessary review-status restriction from prepared 018.
- `npx playwright test tests/browser/booking-budget.spec.tsx tests/browser/booking-collection.spec.tsx tests/browser/trip-review.spec.tsx --workers=2`: **38 desktop/mobile cases passed**.
- `npm run build`: passed with Next.js 16.4.4. A sandboxed build stalled; it was stopped and the build succeeded with local process permissions. No deployment occurred.
- `git diff --check`: passed.

New coverage verifies managed-editor legacy fields, independent review/reservation status, failure retention, duplicate submits, deadline gating, authoritative server preservation and absent-018 rejection. An isolated PGlite test applies the prerequisites and 018, compares the existing booking before/after migration, checks deadline writes/clearing, unchanged expenses/links, revisions, validation rollback, stable IDs and cross-user/anonymous denial. Existing suites cover attachment privacy, draft isolation, materialization, finalization and currency/expense calculations.

Browser coverage includes both entry points, all four types, payment/deadline controls, saved-booking editing, browse/multiple uploads, drag/drop in both contexts, extraction recovery, refresh persistence, removal cancellation, Budget regression, view-only/unavailable-schema states, drawer focus/dirty-close/retry behavior, narrow layouts and existing creation/finalization journeys. All persistence and extraction responses are isolated fixtures/mocks, not live write tests or live paid-provider validation.

## Screenshots

[Desktop/mobile gallery](screenshots/phase11a-unified/README.md) includes Create Trip Add Bookings, existing-trip overview, Stay and Transport drawers, uploaded review and saved cards in both contexts. The options and drawer captures were visually inspected; layout assertions cover matching desktop option height, mobile fit and inline review control alignment.

## Files changed in this phase

- New: `components/shared-booking.tsx`.
- Updated: `components/booking-collection.tsx`, `booking-manager.tsx`, `booking-budget.tsx`, `booking-import.tsx`, `essentials/forms.tsx`, `essentials/view.tsx`, `essentials/attachment-form.tsx`.
- Removed: `components/booking-fields.tsx`.
- Updated: `lib/simple-booking.ts`, `lib/booking-budget.ts`, `app/booking-budget-actions.ts`, `app/booking-budget.css`, `app/create-trip.css` (radio touch targets only), `app/trips/[id]/page.tsx`.
- New SQL: migration 018 and `VERIFY_UNIFIED_BOOKINGS_READ_ONLY.sql`.
- Updated tests: `booking-budget-actions.test.ts`, `booking-budget-reader.test.tsx`, `booking-import.test.tsx`, `essentials-forms.test.tsx`, `fixtures/booking-budget-browser.tsx`, `browser/booking-budget.spec.tsx`.
- New tests: `unified-booking-client.test.tsx`, `unified-booking-database.test.ts`.
- This report and `screenshots/phase11a-unified/` gallery. Generated Next declarations and older recaptured screenshot baselines are restored.

Existing uncommitted destination-search files are outside this phase and remain preserved.

## Limits and review

- No new privileged live metadata inspection or write-based live end-to-end test was performed. Owner-provided prior reports establish inspected 015–017 objects, not full recovery/security sign-off. The earlier excess TRUNCATE and upload-trigger-grant findings are not changed by this refactor.
- Owner-private intake remains owner-private. Shared editors can manage dated bookings and attach originals through existing authorization, but cannot use another owner's intake/extraction collection. Their primary upload option is disabled; widening those permissions would require a separately approved backend change.
- Existing booking tables require dates. Undated owner entries remain in the unfinished collection; normal records and collaborator creation retain their existing date requirements.
- Draft/collection refresh recovery applies to saved data. Unsaved typing is protected by close/unload confirmation, not guaranteed crash recovery or automatic background persistence.
- Actual iOS/Android virtual keyboards and live paid extraction were not tested; browser tests use desktop/mobile Chromium and simulated providers.

Stop for review. No next phase, database application, deployment or publication is included.
