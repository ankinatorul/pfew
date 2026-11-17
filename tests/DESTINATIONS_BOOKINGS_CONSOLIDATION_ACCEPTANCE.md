# Destinations & Bookings consolidation — local acceptance

## Legacy UI and cause

The old `view=destinations` branch in `app/trips/[id]/page.tsx` rendered saved `trip.draft_data.destinations` as a plain `<ol>`, then independently ran the generic segment timeline/empty-state check. A trip with saved JSON destinations but no dated destination segments therefore displayed both its list and “Nothing here just yet”. The dated-stop editor was a generic `SegmentForm`; it could not edit the newer optional-date JSON destinations. Stays also used this legacy segment timeline rather than the shared booking manager.

Destinations now returns one modern card list before those legacy branches. The plain list, explanatory ordering paragraph and obsolete destination empty section were removed. A single genuine empty state appears only when neither destination source has entries. Normal destination deep links now open the destination drawer; new generic plan forms no longer offer a competing destination-creation option. Existing destination ideas remain editable through their existing idea flow.

## Components reused and interface changes

- **BookingDrawer:** reused its responsive shell, focus trapping, Escape handling, close button, busy guard and focus return for the destination editor.
- **LocationPicker:** reused existing worldwide destination autocomplete, validation, debouncing and attribution. No new search provider or coordinate-entry UI.
- **Existing destination storage:** dated stops remain `trip_segments`; saved stops remain `trips.draft_data.destinations`. There are no new destination tables or duplicated records.
- **Existing ordering action:** both Destinations and Trip Explorer use `reorderDestinations` and the shared `DestinationSortList`. The map's up/down buttons and their obsolete CSS were removed. Activity-order controls elsewhere remain unchanged.
- **BookingBudget → BookingsClient → BookingManager → BookingEditor:** Stays now opens this same booking interface with Accommodation selected. Bookings, itinerary booking links and map booking markers all open the existing booking route/drawer. Categories, payments, review/reservation status, uploads, documents and privacy actions are unchanged.
- Legacy stay **plans** are retained below Stays bookings with links to their existing plan editor. They are not silently converted into reservations or hidden/deleted.

## Destination cards and editing

Cards show saved order, name, available country context, supplied dates, a drag handle, a three-dot position menu and an edit affordance. The drawer edits name, selected place, available dates and notes. Other existing segment fields remain unchanged. Saved stop aliases/dates flow into map and itinerary destination displays; Overview displays use the same saved alias.

No destination dates are fabricated. Saved stops can remain wholly or partially undated. Existing dated segments still require both dates and remain constrained to the trip range. Entering dates on a saved stop annotates that existing object; it does not automatically create an itinerary segment, booking or activity.

Unchanged locations retain their original coordinate/provider metadata, even if an old identifier is no longer resolvable. A changed location must resolve through the existing server location resolver; coordinates/time zone come from the selected result. Old provider identifiers are cleared when replacing a place. Save failures retain entered fields; cancellation asks before discarding changes. Removal requires explicit confirmation, preserves bookings/activities, and uses existing foreign-key unlink behavior. Where string-linked plans cannot safely be unlinked automatically, the operation is blocked with a message to move those plans first.

## Ordering and collaboration

Desktop supports pointer dragging by the handle. Touch waits **300ms** for a long press; pointer capture and `touch-action:none` apply only to the handle, preventing accidental scrolling/editor opening during a drag. Dragging and target cards have visible feedback. Pending, cancelled and lost-capture gestures are handled; a changed item sequence cancels a stale gesture rather than moving the wrong item.

Keyboard users press Space/Enter on the handle, choose a position using arrows/Home/End, then Enter to place or Escape to cancel. The three-dot **Move to position** select is a separate accessible fallback. No visible up/down arrows are the primary interface.

Saved-array order and dated segment positions remain the canonical fields used by the map. Mixed lists also persist destination position metadata inside the same existing JSON objects, keeping source records intact. Trip and segment revisions prevent stale writes; a successful move refreshes the existing trip views. Owner and Editor operate on the same trip. Viewer controls are read-only. No realtime subscriptions or independent map ordering store were added.

## Prepared database dependency

**New migration 024_destination_management.sql is prepared, not applied.** It requires **023**, **019**, and their existing dependencies. Migration 023 was not rewritten or applied by this task.

024 adds a capability RPC and one bounded destination mutation RPC for saved/dated editing, removal and mixed ordering. It uses authenticated membership checks, rechecks access after the parent lock, finalized-trip restriction, trip/segment revision checks, validated dates/selected-location fields and atomic updates. It returns no private data. The trusted function owner is checked; API users cannot execute it anonymously.

The 023 trip guard continues allowing only exact destination permutations for direct Editor updates. A narrow trusted-writer exception permits the new RPC to update the destinations key while preserving all other internal JSON, ownership, theme and publication fields. No RLS or Storage policy is disabled, no file is made public, and no existing rows are backfilled. Before/after fixture comparisons confirm the migration itself preserves existing trip rows.

Without 024, cards remain visible and destination editing is safely disabled. Pure saved/dated ordering can still use 023 where available; mixed ordering needs 024. Do not assume either migration is installed in the connected live project. Review before applying; no application occurred here.

## Validation and limits

- Full unit/integration suite: **527 tests / 118 files passed**.
- Final focused migration test: **2 passed**, including reliable location replacement and removal/unlinking without booking loss.
- Browser suites: **29 passed**, **1 intentionally skipped desktop duplicate of the touch-only test**. The mobile long-press test ran and passed. Coverage includes card editing, exact destination selection, position menu, keyboard and pointer dragging, refresh recovery, viewer behavior, map, shared booking drawers, payment/status/privacy regression checks and mobile overflow.
- Final destination-only browser run: **7 passed**, the same intentional desktop touch-only skip; updated screenshots show the completed drawer spacing and Lime actions.
- Lint and TypeScript: passed. Production build passed on retry after the existing Next.js security advisory. No unrelated dependency upgrade was made.
- Screenshots: `tests/screenshots/destinations/{desktop,mobile}/{cards,details}.png`. Synthetic records only; original approved tracked screenshots were preserved.
- Earlier runs suffered local timeout interruptions; unaffected timeout cases passed in the final full run. Browser fixture-only setup issues were corrected, not production checks bypassed.

All writes in tests used PGlite or in-memory browser mocks. No live trip, membership, booking, file or Supabase configuration was changed. Real connected-schema state and live two-account behavior remain unverified. No migrations, deployment, push or merge occurred. Prior uncommitted map work and the unrelated duplicate test file were preserved.

## Files for review

New: `components/destinations.tsx`, `components/destination-sort-list.tsx`, `lib/destination-management.ts`, `app/destination-actions.ts`, `app/destinations.css`, migration 024, destination SQL/UI/browser tests and fixtures, screenshots and this note.

Updated integration: trip route/layout, map component/order action/data derivation, saved display names in Overview/itinerary, generic plan form destination option, BookingBudget/BookingManager accommodation filter, itinerary booking-title links, related tests/Playwright registration. No new library was needed for dragging or editing.
