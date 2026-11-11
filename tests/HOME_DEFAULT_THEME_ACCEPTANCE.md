# Home — Default theme review

Scope: Home only. The attached approved moodboard's Travel HQ panel guides the gradient surfaces, Manrope hierarchy, lime primary action, rounded cards, subtle borders/shadows, and compact trip previews. Its trip-dashboard panel, photographs, decorative illustrations, dates, and fictional trip details are not application content. The Phase 2 sidebar and the dedicated trip dashboard are unchanged.

Home uses all available application content width on an off-white background. There is no outer rounded panel, shadow, border, or centered maximum-width frame. The composition starts with the full-width welcome hero, featured trip, and three equal-width status cards; preparation/today and other trips follow. Individual cards retain their surfaces and rounded corners. Browser checks cover widths through 2560px and verify that the sidebar stays pinned while scrolling.

## Files

- `app/page.tsx`: existing authenticated Home loader and authorized featured-trip selection. A most-recent past trip remains reachable when there is no current/upcoming trip.
- `components/home-view.tsx`: shared, data-driven Home presentation. The existing `TripCollection` uses its compact presenter; full collection filtering, selection, and deletion stay in My Trips.
- `components/essentials/home.tsx`: existing saved-data summary loader, extended with packing states and uploader-scoped document states. It never reads private filenames, paths, or file contents for Home.
- `lib/home-summary.ts`: Home composition over existing timezone, task-window, and event-order helpers.
- `app/home.css`: styles scoped to `.home-hq`, imported once by `app/layout.tsx`. Shared tokens, shell styling, and other screens retain their existing values.
- Tests: `tests/home-page.test.tsx`, `tests/home-dashboard.test.tsx`, and `tests/browser/home-layout.spec.tsx`; the browser configuration includes the Home tests.

## Local review

Open `http://localhost:3000/` with `npm run dev` running. Use the existing Google session/sign-in flow. No configuration changes, new dependencies, migrations, or seed data are required.

1. Verify the greeting uses your account's name, and the featured trip uses its saved name, dates, and lifecycle. Open trip must open `/trips/[id]`, while Create a trip opens the existing creation flow.
2. Before departure, preparation comes first: real task progress and up to two dated tasks. An empty checklist offers the existing optional Prep starters without creating tasks automatically.
3. During travel, the current saved destination determines the local date and timezone. Today's saved activities appear first; unscheduled Ideas remain excluded. View today opens the correct itinerary day.
4. Next events retain the existing saved-time/ongoing/unknown-time rules. The next-booking card uses saved bookings, not sample reservations or external tracking.
5. Check packing percentage and packed/total counts against the existing packing list. An empty list has no invented percentage. Failed reads are labeled unavailable.
6. Documents counts only your own ready/incomplete uploads. There is no document-review status in the current data model, so Home does not invent a “to review” count. The card opens the existing trip Documents view.
7. Other trips shows up to two accessible records in the established lifecycle order. View all opens My Trips, where all existing search, filters, Feature on Home, and owned-trip deletion controls remain available. The current-trip switcher also retains Home selection.
8. Check an empty account, shared trips, a past trip, missing summary data, long names, keyboard focus, and widths of 320/375/768/1024/1440px. Home CSS must not change the sidebar, forms, My Trips, or trip dashboard.

## Verification

Run `npm run lint`, `npm run typecheck -- --incremental false`, `npm test`, `npm run build`, and `npm run test:e2e`.

Completed: lint and TypeScript passed, all 210 tests passed, the production build passed, and all 20 browser checks passed. The local development server remains available on port 3000. Build-generated `next-env.d.ts` was restored to its pre-Home working copy.

Browser screenshots use the actual Home presenters and stylesheet with synthetic test records in an isolated page. They do not add a mock route or write records to Supabase. Fresh authenticated/cross-account verification remains a manual review; no private browser session was borrowed.

## Rollback

The pre-Home workspace is preserved in `/private/tmp/pfew-before-home-20261106T140918Z/workspace.tar.gz`, verified against its adjacent file-hash manifest. It contains original tracked/untracked work, Git metadata, screenshots, and private configuration; generated dependencies/build output are excluded. Restore into a separate empty directory and compare files rather than resetting this working tree. Keep the checkpoint private.
