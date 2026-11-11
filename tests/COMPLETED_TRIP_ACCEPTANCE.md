# Completed trip dashboard — Phase 6

Completed trips now use the existing shared Trip Dashboard with a compact lavender Trip Recap. The title, destination, dates, owner-only Edit trip action, six navigation pills, Trip at a glance, five module cards, and secondary tools remain on the same full-width application canvas. No journal, photo album, product archive, or new storage system was introduced.

## Files created

- `components/trip-recap.tsx`: pure presentation using the existing typed overview and navigation helper. Shows the approved headline/supporting copy, saved trip name and destinations, dates, safely calculated duration, and an itinerary link.
- `tests/fixtures/completed-trip.ts`: isolated saved records and test clock, never loaded by the application.
- `tests/completed-trip.test.ts`: date boundaries/edits, empty or ambiguous states, real summaries, no automatic record completion, and budget record provenance.
- `tests/browser/completed-trip-layout.spec.tsx`: actual shared presenter/shell/CSS with isolated completed-trip data, responsive and empty/unavailable states, permissions, and screenshots.
- This acceptance report.

## Files modified

- `app/trips/[id]/page.tsx`: send every hub lifecycle through TripDashboard. Remove the superseded legacy hub rendering branch. Existing feature sections, Edit Trip route, customization action/preferences, and saving/deletion implementations remain in place.
- `components/trip-overview-view.tsx`: select the recap for `phase === "past"`, show Completed trip status, and reuse the same cards with historical wording and order: Itinerary, Bookings, Documents, Budget, Packing. The header pills retain their approved order. Upcoming and ongoing content/ordering are unchanged.
- `lib/trip-overview.ts`: add a derived `hasBudgetRecords` flag from the existing fetched allocations, expenses, and recorded booking prepayments so empty budget records are distinguishable from explicitly saved zero-valued records. No lifecycle or financial calculation was replaced.
- `app/trip-overview.css`: scoped recap styles only, using the existing tokens and grid.
- `tests/trip-overview-route.test.ts`: cover completed hub routing and continued owner/editor historical editing.
- `tests/trip-overview-view.test.tsx`: cover the existing scoped loader, historical data, absence of primary preparation/travel prompts, navigation and owner/editor/viewer controls.
- `playwright.config.ts`: register the completed-trip browser cases.

## Existing logic reused

`TripDashboard`, `TripOverviewView`, `tripOverview`, `tripOverviewPhase`, `lifecycle`, `localToday`, `days`, existing date formatting/duration, `budgetSummary`, `tripSectionUrl`, shared cards/grid/design tokens, Supabase `access`/RLS and `tripRole`, private document summaries, and all existing feature routes.

The server loader and its authorization/scoped queries are unchanged. Editing uses the existing owner-only settings route/form/validation/action. Editors retain their existing itinerary editing access after the trip ends. Delete Trip remains at the bottom of Edit Trip with the existing confirmation and action; no deletion code changed.

## Completed states and data meaning

- The recap appears only when the established lifecycle helper returns past. The saved trip end date remains inclusive in its saved timezone; completion begins on the following local calendar day.
- Known dates/destinations/duration come from saved records. Destinations are saved planned stops, without a claim that they were visited. No distance, completed-activity count, memories, spending estimate, or decorative statistics are invented.
- Saved planned activities remain planned. Booking verification remains user-entered verification, without an implication that a reservation was used. Historical packing/task states are retained and never marked complete by rendering.
- Historical cards use friendly empty states for absent itinerary entries, bookings, packing lists, private documents, and budget records. Query failures remain unavailable states rather than fabricated empty data.
- The Budget card distinguishes the saved target, planned allocations, recorded prepayments, and recorded spending by currency. It does not label a final trip total or add prepayments to expenses. A budget target alone remains visible while the absence of separate budget records is explicit. A saved zero-valued allocation still counts as a record.
- Documents use the existing current-uploader state summary and storage authorization. No filenames, file contents, paths, or another traveler's private metadata were added to this overview.
- Multiple saved destinations appear in the recap. Trip at a glance and existing module navigation remain available.
- The completed primary content contains no preparation panel, countdown, today's plan, travel inspiration, automatic urgent reminders, or preparation mutation controls. Existing historical records remain accessible through their existing sections and navigation.

## Verification

Completed locally:

- `npm run lint`: passed.
- `npm run typecheck -- --incremental false`: passed.
- `npm test`: 63 files / 272 tests passed.
- `npm run test:e2e`: 46 tests passed across desktop and mobile, including existing auth, offline, Home, navigation, trip management, upcoming and ongoing dashboards, and the new recap cases.
- `npm run build`: passed.
- `git diff --check`: passed.

New checks cover completed data and empty/unavailable summaries, real planned/prepaid/recorded amounts, per-currency spending, zero-valued saved budget records, retained incomplete packing/tasks, no inferred booking usage or activity completion, missing/reversed/invalid dates, inclusive last-day/timezone boundaries, date edits, owner settings, editor historical editing, viewer controls, scoped trip reads and uploader-private documents. Responsive checks cover 320/375/768/1024/1440/1920/2560px widths and verify no outer frame, restrictive width, or horizontal overflow.

Browser screenshots use the actual presenter, shared shell, fonts and CSS with isolated synthetic records. No real trip dates, reservations, tasks, expenses, documents, or accounts were modified. Signed-in cross-account acceptance with real accounts remains manual; no private browser session was borrowed.

Previews:

- Desktop: `test-results/completed-trip-layout-comp-58c50-and-real-historical-modules-desktop/trip-recap.png`
- Mobile: `test-results/completed-trip-layout-comp-58c50-and-real-historical-modules-mobile/trip-recap.png`

For a real-data preview, open My Trips at `http://localhost:3000/trips` and open an existing trip whose valid saved end date is before today in its saved timezone. No date override or data seeding is needed.

## Known limits and lifecycle edges

The existing required-date creation/database contract is unchanged. Missing, open-ended after departure, reversed or invalid dates and an invalid trip timezone retain the existing review/fallback state instead of guessed completion. An empty itinerary never establishes completion. Date edits recompute the phase from the current saved trip on navigation/refresh.

The dashboard remains a server-rendered snapshot; a tab left open through local midnight requires refresh/navigation. Saved plans and confirmations cannot prove that a journey occurred or that reservations were used. Spending is only what users recorded, without currency conversion or a verified final total. Existing legacy hub layout preferences remain stored; the approved shared dashboard uses its fixed module composition.

Application actions, APIs, database migrations/configuration, storage cleanup, authentication, environment/dependency files, Home, sidebar/mobile shell, Create Trip, and underlying feature components were verified unchanged against the pre-Phase-6 workspace. No deploy, push, or merge was performed.
