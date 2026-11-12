# Phase 11A.1B — Booking drawer correction

Implemented locally on 12 November 2026. Scope: Create Trip → Add Bookings. No live test writes, migration application, deployment, push, merge or dependency changes. Prior uncommitted work is preserved; pre-phase checkpoint: `/private/tmp/pfew-before-phase11a1b/source/`.

## What changed

- Replaced the expanded Create Trip booking editor with a shared native modal drawer for manual creation, existing draft edits and uploaded reviews. No old `.collection-editor` is rendered in Step 2. The existing detailed editor remains available outside Create Trip.
- Desktop drawer is 480px wide, attached to the viewport's right edge, with a white surface, restrained shadow/backdrop, close control and opening animation. Mobile uses the entire viewport. Only the field area scrolls; header and Save footer remain accessible.
- Booking types are accessible icon radio pills: Stay, Transport, Experience, Other. Payment is Paid, Pay later or Not set. Pay later reveals the optional Payment due field; existing partial-payment data has a legacy Partially paid option so it cannot be silently reset.
- Compact cards have a type icon, clickable name, available date/cost/payment information, Needs review only when applicable, and a small actions menu. Large page-level Review/Remove controls and repeated editor headings are gone. Failed-upload recovery remains a direct actionable control.
- The two upload/manual options and the single bottom Continue action remain. Uploads, consented extraction, source evidence and private-file recovery reuse the existing pipeline. Open confirmation is available inside a ready source's drawer through the existing authorized endpoint, in a separate tab.

## Files changed

- New `components/booking-drawer.tsx`: native modal lifecycle, focus return, Tab boundaries, Escape/backdrop handling, scroll locking and viewport sizing.
- `components/booking-collection.tsx`: editor lifecycle, compact cards/menu, new-entry handling, successful/failed saves, dirty-close/navigation protection and original-confirmation access. Existing request/storage/extraction/revision functions remain in use.
- `components/simple-booking-fields.tsx`: radio pills and the same contextual fields; reliable extracted provider can prefill a blank Name. Hidden legacy fields remain preserved through the existing overlay.
- `app/create-trip.css`: scoped drawer/card/pill styles, safe areas, responsive full-screen layout and reduced motion.
- `tests/simple-booking-client.test.tsx`: updated UI contract plus new empty-cancel, dirty-close, focus-return, failure/retry and duplicate-submit assertions. Its jsdom-only dialog shim does not claim to test native focus containment; real-browser tests do that.
- `tests/browser/booking-collection.spec.tsx`, `tests/browser/trip-review.spec.tsx`: drawer/pill interactions and regression cases; two new scenarios run on both desktop and mobile.
- `tests/fixtures/trip-review-browser.tsx`: isolated first-save failure fixture.
- This report and `tests/screenshots/phase11a1b/README.md`/captures.

Trip Basics, Travel Style, Success, Home, existing dashboards, APIs, Supabase configuration and migration files are unchanged by this phase. Generated Next declaration references and older screenshots recaptured by regression tests are restored after checks.

## Drawer and accessibility details

Uses native `<dialog>.showModal()` rather than a new library. The underlying page becomes inert; focus moves to Name. Explicit keyboard boundaries keep Tab/Shift+Tab in the editor, and closing returns focus to the opener. Escape, Close and backdrop dismissal use the same protected close operation. Dismissal is blocked during an active request.

Dirty close asks for confirmation and retains the entered values in the existing page state; Continue saves them through the existing collection. It does not silently discard edits or pretend an unsaved entry is persisted. A browser `beforeunload` guard protects dirty inputs from accidental navigation. An untouched new manual editor can close without an empty saved booking. No server call is made merely to open it.

Successful Save booking / Save changes closes the drawer only after a successful server response. Failed saves keep the drawer and fields, announce an actionable error inside it and preserve the stable ID for retries. The existing synchronous running guard blocks repeated submissions. Unknown booking dates remain Needs review under the existing backend contract rather than becoming fabricated scheduled records.

Mobile sizing uses dynamic viewport height plus visual-viewport/window resize handling; the footer honors safe-area insets and stays within a simulated shorter viewport. Motion is disabled for reduced-motion users. Native labels, radio keyboard semantics, visible focus styles and at least 44px primary/close targets are retained. No custom dialog nesting or new navigation step was added.

## Field mapping and data preservation

| UI                                             | Existing model                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Stay                                           | `accommodation`                                                                                                    |
| Transport                                      | New entries use `ground transport`; existing flight/ferry/car rental subtype remains when the UI type is unchanged |
| Experience                                     | `activity`                                                                                                         |
| Other                                          | `other`                                                                                                            |
| Paid / Pay later / Not set                     | `paid` / `unpaid` / `unknown`; legacy `partial` remains intact                                                     |
| Dates, times, places, cost/currency, reference | Existing staged fields and verified-location normalization                                                         |
| Payment due                                    | Existing prepared 017 dedicated nullable date; capability-gated as before                                          |

The existing field overlay preserves unrendered provider details, notes, travelers, partial paid amounts, custom legacy fields, zones, geographic context and itinerary association. Owner-private drafts, revisions, stable IDs, reservation status, source checksums and files remain unchanged. Reviewing does not confirm a reservation. The same materialization/finalization operations preserve originals and later booking/expense relationships. No action creates an expense from a price or payment pill; Phase 9 expense-only actual totals remain unchanged.

The native form contains only the active entry; closing does not add a second booking or duplicate its attachment. Opening a review never calls extraction automatically. Existing explicit consent/request limits and failure recovery remain.

## Verification

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **409 tests in 94 files passed**. The final six drawer component cases passed again after adding unconfirmed-response protection.
- `npm run test:e2e`: **106 desktop/mobile cases passed**.
- `npm run build`: passed.
- Isolated unit cases exercise legacy data preservation, missing-date Needs review behavior, payment capability gating, no empty pre-save, dirty close/focus return and failed-save duplicate protection.
- Existing isolated PostgreSQL/RLS suites remain included: draft ownership, CAS/retry behavior, booking materialization, attachment privacy, deadline transfer and no automatic expense creation. No SQL schema change was needed for this correction.
- Browser coverage includes all four type pills, contextual fields, all payment choices/deadline, original-file review, all previous creation/finalization/active-trip behavior, native focus cycles, reduced motion, desktop/right-edge and mobile/full-screen sizing, shorter viewport footer, safe close, edit, failure/retry, compact cards, removal cancellation and Continue without bookings.
- Browser fixtures use simulated persistence/transport; no authenticated production write-based testing, paid extraction or real deletion occurred.

## Screenshots

See [gallery](screenshots/phase11a1b/README.md): desktop/mobile Add Bookings, Stay drawer, Transport drawer, uploaded review and saved cards. Mobile Stay/Transport captures demonstrate the full-screen editor and fixed Save action. Drawer captures wait for opening animation and use the visible viewport; overview captures can show the full page. Fictional fixtures only.

Desktop and mobile screenshots were visually inspected against the approved Pfew direction: existing Cobalt shell/off-white page, Lavender selected pills, Lime actions, compact cards, restrained borders and no page-level wrapper or decorative assets.

## Limitations and migration dependencies

- **No new migration.** Existing 010–014 collection/finalization requirements and runtime gates remain. Earlier owner-provided reports showed their expected objects present; this phase does not claim a new privileged live inspection.
- Payment due still requires reviewed migration **017**, prepared in Phase 11A.1 and not applied here. Until available, the picker is disabled with a short explanation. Ordinary Pay later/Not set/Paid work through existing fields. Pending 015/016 and earlier recovery/permission findings remain separate handoff work.
- The normal booking model still requires scheduling details. Incomplete entries stay saved in the existing Needs review collection; segment constraints and reservation status are not weakened.
- Confirmed dirty close preserves edits on this page. Refresh recovery is of saved records; the unload prompt protects unsaved typing, but it is not cross-browser draft autosave or a guarantee after a browser/device crash.
- Desktop/mobile Chromium fixture tests and viewport shortening cover layout behavior; actual iOS/Android virtual-keyboard/device QA remains advisable. Native dialog support is assumed for the project's modern browser baseline.

Stop here for review. No unrelated phase, deployment or database application is included.
