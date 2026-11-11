# During-trip dashboard — Phase 5

The existing trip overview now selects its primary content from saved dates: preparation before departure, today's plan followed by optional inspiration while traveling, or a date-review notice when the travel state cannot be established. Completed trips retain their existing hub. All existing feature-section interfaces remain in place.

## Files

Created:

- `lib/during-trip.ts`: typed, read-only daily plan assembled from existing segments and bookings, destination/timezone context, linked-record deduplication, and saved-idea selection.
- `components/during-trip-plan.tsx`: today's plan and the smaller optional inspiration card, using existing navigation utilities and scoped overview styles.
- `tests/fixtures/during-trip.ts`, `tests/during-trip.test.ts`, and `tests/browser/during-trip-layout.spec.tsx`.
- This acceptance guide.

Modified:

- `app/trips/[id]/page.tsx`: use the shared overview for upcoming, ongoing, and uncertain-date hub views; leave completed hubs and feature views on their existing paths. Pass one request timestamp through the overview loader for consistent lifecycle/day calculations.
- `components/trip-overview.tsx`: rename the existing server component from PreDepartureDashboard to TripDashboard as it now serves both phases. Reuse its existing scoped queries and data/error mapping. Mount preparation mutation controls only before departure.
- `lib/trip-overview.ts`: extend the existing lifecycle gate to explicit upcoming/traveling/past/unknown phases, attach today's summary when appropriate, and preserve all common module summaries.
- `components/trip-overview-view.tsx`: reuse the approved title/Edit trip/pills, summary, five modules, and secondary tools; select the appropriate primary panel. No duplicate dashboard or outer card.
- `app/trip-overview.css`: scoped timeline, status, and inspiration styling on the existing responsive grid. The pre-departure card styling and shared shell are preserved.
- `playwright.config.ts`: register the new browser cases.
- `tests/trip-overview.test.ts`, `tests/trip-overview-view.test.tsx`, `tests/trip-overview-route.test.ts`, and `tests/browser/trip-overview-layout.spec.tsx`: extend lifecycle, permission, empty-state, and regression checks.

Home, shell/sidebar components and CSS, editing/deletion actions, underlying feature components, Supabase configuration/migrations, package dependencies, and environment files were not modified.

## Reused logic and behavior

- `access`, `tripRole`, existing Supabase/RLS queries and uploader-private document scoping.
- `lifecycle`, `localToday`, `departureCountdown`, `days`, and `dashboardDestination`.
- `localInstant` and `savedSchedule`, using the existing Temporal dependency for local-day boundaries including skipped midnight and 23/25-hour days.
- Existing trip overview loader/model/presenter, shared design tokens, `tripSectionUrl`, budget accounting, packing/documents summaries, and overview navigation.
- Existing Itinerary, Bookings, Ideas, Research, Map, Trip Check, People, Offline, and owner-only settings workflows.

The next-event helper intentionally excludes earlier events, so it is not suitable for the whole daily itinerary. The daily adapter reuses saved instants and intervals while retaining earlier plans from the same local day.

## Implemented states

- Upcoming trips keep their approved preparation-first overview and countdown.
- Ongoing trips show the full saved local day in chronological order: activities, notes, transport/stays, and reservations. Planned entries, confirmed itinerary plans, user-confirmed bookings, and unconfirmed bookings remain distinct. Provider, reference, saved locations, and saved end/arrival times appear only when present.
- An itinerary copy linked to a visible booking is suppressed. The booking row links back to its itinerary; differing saved date/time details are flagged, and each record's independent saved confirmation is respected.
- Booking-only days render real booking rows. Empty successful reads display “Nothing planned for today. Your day is yours.” Failed booking reads instead explain that the list may be incomplete.
- Today's calendar follows the current saved destination selected by the existing helper, falling back to the trip timezone. Chronology compares instants across zones and dates. Untimed and ambiguous/nonexistent saved local times remain visible after timed entries, with review labels rather than invented instants. Multi-day rows are saved context, not claims of live availability or occupancy.
- Trip lifecycle retains the saved trip-timezone contract. Itinerary defaults to today's destination-local day during travel; individual cross-zone entries link to their saved itinerary day so the existing section can show the record.
- Missing departure, invalid/reversed dates, invalid trip timezone, and a started trip without a saved return date show date-review content without claiming travel is underway. A known future departure can still establish that departure is upcoming even without a return date. The existing creation/database contract requires both dates; this phase adds defensive presentation, not a new open-ended creation workflow.
- Optional inspiration uses at most two existing unscheduled ideas explicitly associated with today's saved destination. Otherwise it offers Research. No venues, hours, travel times, availability, free-time estimates, AI provenance, or current physical location are invented. Rendering makes no paid AI/provider calls and saves no suggestions or plans.
- Viewers retain existing read-only links; they do not gain Edit trip, Add an activity, or preparation mutation controls. Private document summaries remain scoped to the current uploader. The full-width grid and mobile shell are reused.

## Verification

Completed locally:

- `npm run lint`: passed.
- `npm run typecheck -- --incremental false`: passed.
- `npm test`: 62 files / 264 tests passed.
- `npm run test:e2e`: 40 tests passed across desktop/mobile, including existing auth, offline, Home, navigation, trip-management, and upcoming-dashboard regressions.
- `npm run build`: passed.
- `git diff --check`: passed.

New checks cover activities, booking-only and empty days, unavailable booking reads, exact and differing linked records, overnight travel, multi-destination timezone boundaries, invalid/edited/incomplete dates, open-ended uncertainty, ambiguous DST times, midnight gaps, mutation-free models, query isolation, existing links and permissions, and 320/375/768/1024/1440/1920/2560px widths. Upcoming and completed-route regressions remain covered.

Browser screenshots render the actual presenter, shared shell, fonts and CSS using isolated synthetic records. No real trip dates/bookings were edited or seeded. Live authenticated cross-account acceptance remains manual; no private browser session was borrowed.

Previews:

- Desktop: `test-results/during-trip-layout-today-s-b22b8-g-navigation-modules-remain-desktop/trip-during-travel.png`
- Mobile: `test-results/during-trip-layout-today-s-b22b8-g-navigation-modules-remain-mobile/trip-during-travel.png`

For a real-data preview, leave `npm run dev` running, open My Trips, and open an existing ongoing trip. Refresh/navigation recomputes lifecycle and local day from the current saved records. No clock override, backend edits, or test seeding is needed.

## Limits and rollback

The dashboard is a server-rendered snapshot: a tab left open across midnight needs refresh/navigation to show the new day. Saved destination dates represent planned context rather than GPS location. Provider availability and arrangements outside Pfew are not checked. Generic research invitations and saved ideas have no new persistence or automatic scheduling. Existing open-ended creation and feature-page contracts remain unchanged.

The pre-Phase-5 private checkpoint is `/private/tmp/pfew-before-during-trip-20261106T155537Z/workspace.tar.gz`, with its file-hash manifest. It preserves the pre-existing uncommitted source/configuration; compare individual files rather than resetting this workspace. Byte-identical duplicate generated Next type copies were preserved in the checkpoint's `duplicate-generated-types` folder before removing them from build output to unblock TypeScript. Keep the archive private because it includes local configuration. No deploy or push was performed.
