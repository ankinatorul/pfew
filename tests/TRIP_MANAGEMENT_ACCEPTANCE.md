# Trip management — Phase 4.1

The upcoming dashboard has no Trip actions trigger or menu. An owner-only Edit trip link sits beside the title and opens the existing `?view=settings` route. The header retains its six existing section pills. The dashboard and editor use the shared full-width application canvas. Home, sidebar presentation, and the underlying feature pages are unchanged.

## Files changed

Application files modified:

- `components/trip-overview.tsx`: remove the actions-menu slot.
- `components/trip-overview-view.tsx`: replace the slot with a subtle owner-only Edit trip link using `tripSectionUrl` and the selected day.
- `components/trip-overview-controls.tsx`: remove the redundant menu implementation; preserve saved-finding dismissal.
- `app/trips/[id]/page.tsx`: compose the existing settings route with TripEdit; reject non-owner direct access through the existing not-found boundary.
- `components/forms.tsx`: reuse TripForm and Delete; clarify edit-only wording and link to existing Destinations; add pending state, explicit confirmation, cancellation feedback, and inline deletion failures. Creation fields, validation, saving, and segment deletion actions remain in place.
- `app/actions.ts`: retain the authorized `deleteTrip` operation and cleanup sequence; return expected failures to the existing Delete control and redirect success to My Trips after root-layout revalidation. `saveTrip` is unchanged.
- `components/app-shell.tsx` and `lib/active-trip-store.ts`: reconcile a stale active-trip identifier against the refreshed accessible trip list after leaving the trip route. Choose the existing resolved fallback or remove only this account's preference when no trips remain. Failed trip-list reads never clear the preference.
- `app/shell.css`: extend the existing full-width canvas selector to the editor.
- `app/trip-overview.css`: remove menu styling and scope the editor, subtle edit link, lime primary actions, and separated danger section to trip management.

Application files added:

- `components/trip-edit.tsx`: presentation/composition of the existing TripForm and Delete controls, with Back to trip and a separate danger section. No duplicate form or server action.
- `lib/trip-deletion.ts`: shared confirmation/description matching the current deletion operation.

Tests/configuration:

- Updated `tests/app-shell.test.tsx`, `tests/trip-overview-route.test.ts`, `tests/trip-overview-view.test.tsx`, `tests/browser/trip-overview-layout.spec.tsx`, and `playwright.config.ts`.
- Added `tests/trip-deletion.test.ts`, `tests/trip-management.test.tsx`, `tests/fixtures/trip-management-browser.tsx`, and `tests/browser/trip-management.spec.tsx`.
- Added this review guide.

## Reused behavior

The form still calls `saveTrip`, validates through `tripSchema`, preserves the saved timezone, and uses the existing owner-scoped update. Both settings and the Edit trip link remain owner-only; editors/viewers do not gain trip-settings permissions.

Delete uses the existing owner-scoped action, `has_other_private_files`, `removeBookingFiles`, Supabase/RLS, and database cascades. No database schema, storage configuration, API, authentication, or deletion implementation was duplicated. Successful deletion revalidates `/` with the existing layout scope and redirects to `/trips`, refreshing Home, My Trips, and shared trip context.

Confirmation explains that deleting affects the trip and its saved plans, bookings, preparation, packing, budget, research, sharing access, and attached booking files. It also explains the private-file restriction and that provider reservations, user accounts, and separately downloaded offline copies are not deleted. Cancel prevents submission. Expected failures remain inline with the trip editor; unexpected transport failures report that deletion could not be confirmed rather than claiming success.

## Verification

- `npm run lint`: passed.
- `npm run typecheck -- --incremental false`: passed.
- `npm test`: 61 files / 250 tests passed, including existing isolated database/RLS/cascade tests.
- `npm run test:e2e`: 34 tests passed across desktop and mobile. Covers existing auth/offline/Home/navigation regressions, six dashboard pills and no menu, editor navigation and validation, confirmation cancellation, failure feedback, successful My Trips routing, fallback selection, and last-trip preference cleanup. Widths include 320, 375, 768, 1440, and 2560px for the editor.
- `npm run build`: passed.
- `git diff --check`: passed.

Deletion action tests use mocked clients only. Browser interaction tests bundle the actual form, Delete control, dashboard presenter, AppShell, and active-selection logic using Vite already provided by the test toolchain. Next navigation, account display, and server actions are isolated stubs; no test route or fixture is shipped in the app. These tests never issue a real trip deletion or borrow a signed-in browser session. Live authenticated save/delete round trips have therefore not been performed.

Captured screenshots use synthetic records:

- `test-results/trip-management-Edit-trip--6727d-width-desktop-mobile-canvas-desktop/edit-trip.png`
- `test-results/trip-management-Edit-trip--6727d-width-desktop-mobile-canvas-mobile/edit-trip.png`
- Updated dashboard screenshots are in the existing trip-overview browser output folders.

## Limits and rollback

Existing file cleanup happens before the database trip deletion and is not atomic across storage/database operations. If cleanup or final deletion fails, the trip record remains but some attached files may already have been removed. Feedback reports this existing limitation; no new transaction or storage behavior was introduced. A lost network response may leave the outcome uncertain, so feedback asks the user to check My Trips before retrying. Downloaded encrypted offline snapshots remain subject to their existing separate lifecycle.

The existing wizard structure is preserved. This phase does not replace the creation flow or redesign during-trip dashboards and other feature sections.

The private pre-change checkpoint is `/private/tmp/pfew-before-trip-management-20261106T151554Z/workspace.tar.gz`, with a hash manifest. It preserves the original uncommitted source and configuration. Byte-identical duplicate generated Next type files encountered during verification were moved into its `duplicate-generated-types` folder. Compare/restore individual files rather than resetting this workspace. Keep this archive private because it contains local configuration.
