# Trip map experience — local acceptance

## Implemented

The existing Trip Overview has a compact **Your trip map** card below its primary summary/preparation area. It shows numbered destination pins, selection, straight dashed connections, fitted bounds, an ordered accessible list and **Expand map**. Desktop height is 310px; mobile is 240px. The dashboard map stays fitted to the route when a pin is selected.

The existing `/trips/[id]?view=map` route now opens the Trip Explorer within the approved application shell. Desktop uses a 32% details panel and 68% map. Mobile uses a map and collapsible details sheet with a sticky toggle and safe-area padding. The explorer includes categorized saved locations, a Connect pins toggle, destination dates where saved, explicit destination associations, list/map selection, existing detail links, clustered secondary points and role-aware ordering controls. Marker clicks open/focus the matching panel entry; secondary selection zooms enough to reveal a clustered point. Destinations take click priority over overlapping secondary markers.

There is no map booking editor or new trip state store. View booking opens the existing booking drawer; itinerary/detail actions use existing routes. Saved-place management remains available at `?view=places`; its renderer also uses MapLibre. The unused Google JavaScript renderer was removed. Existing external map links and independently configured discovery tools were not rebuilt.

## Library and provider

- Added **maplibre-gl 6.18.0**. It is dynamically imported client-side; unrelated routes do not initialize maps or fetch tiles.
- Central configuration: `lib/map-config.ts`. Default public style: `https://tiles.openfreemap.org/styles/positron`. Optional `NEXT_PUBLIC_MAP_STYLE_URL` can point to a compatible provider or self-hosted style; no environment variables were changed.
- No API key, paid routing/geocoding service, subscription or PostGIS dependency was introduced. Provider attribution remains visible. No tile prefetch/offline download cache was added.
- MapLibre 6 needs an explicit worker with this bundler. `npm run sync:map-worker` copies the installed package's matching worker and BSD license into `public/maplibre/`; `npm run build` runs that synchronization automatically. This avoids a worker CDN dependency. The generated third-party worker is excluded from application linting.
- The installed transitive `@mapbox/jsonlint-lines-primitives` package declares Node >=22; verify a compatible build runtime before release.
- OpenFreeMap documents its public styles, attribution and absence of SLA guarantees: [quick start](https://openfreemap.org/quick_start/), [provider information](https://openfreemap.org/). Do not assume guaranteed availability. Style/network/WebGL/worker/chunk failures retain destination-list navigation and a useful fallback. Retry is user initiated.

## Existing data reused

Trip `draft_data.destinations` preserves saved array order and verified coordinates. Dated stops reuse `trip_segments.kind`, `position`, dates, location IDs and coordinates. Activities/stays reuse their existing segment records and explicit `destination_id` / `destination_location_id` relationships. Bookings reuse `segment_id`, categories, start/end coordinates and dates. Saved places reuse existing categories and coordinates. Transport arrivals use stored arrival/end coordinates. Booking-linked segments are deduplicated only when the segment has no independent mapped point or its stored location matches the booking; distinct saved coordinates are retained.

The overview reuses its already fetched bookings. Explorer queries are scoped to the current, previously authorized trip using the authenticated Supabase client. Map queries never select attachment rows, file URLs, confirmation references, traveler details, notes, invitation secrets or sharing tokens. Existing RLS, access, trip-role and private document rules remain in force. No public map-data endpoint was added.

## Ordering and migration

**Prepared only:** `supabase/migrations/023_destination_order.sql`. Not applied to Supabase.

- Map viewing requires no new schema. Move controls are hidden unless `destination_order_version()` is available. Existing destination-editor links remain usable.
- Migration 023 requires 019 and its dependencies, including 014's segment revision guard. It adds a capability RPC and an atomic, **security-invoker** reorder RPC using existing fields; no new tables, coordinate columns or PostGIS extension.
- Dated destination ordering updates existing `position` fields under row locks and validates every segment revision. Saved-array ordering validates the current trip revision and permutes the exact existing JSON objects. No dates or coordinates change.
- 019 originally prevents Editors from altering all internal draft JSON. The updated guard permits only a permutation of the **same** destination objects on an editable finalized trip. Other JSON keys, location contents, ownership, theme and publication fields remain protected; RLS is not disabled or bypassed.
- Existing Overview/destination choices use saved positions with date/ID fallbacks for equal legacy positions. Reordering therefore updates the canonical existing order rather than a map-only copy.
- A mixed legacy trip can have dated stops plus additional saved destinations lacking a dated route position. All are displayed, but the extra stops are not silently numbered/connected as an invented route; the UI explains the ambiguity and disables move controls until the records are reconciled in Destinations.
- Migration is transactional, intended for one application and prepares functions only. Local fixtures confirmed existing trip rows are unchanged by applying it. Review the 019 guard replacement before explicitly approved application; do not replay older migrations over it.

## Location and interaction limits

- Named locations without valid coordinate pairs remain in the panel as **Location not mapped**. Legacy saved destination labels are retained even if coordinates are absent.
- No private address or document content is sent for geocoding. No city-center substitutions, directions, driving distances or travel-time claims are generated. Saved places with only a legacy Google ID remain unmapped until they receive explicit coordinates through a separately reviewed workflow.
- Connections use GeoJSON LineStrings between consecutive mapped, ordered stops. Missing intermediate coordinates break the connecting line. Longitude unwrapping and minimum-arc bounds handle date-line crossings.
- Only explicit stored destination relationships group secondary records. Unassociated bookings/places remain under Other saved places; proximity/dates are not presented as proof of an association.
- Secondary markers use source layers and native MapLibre clustering, not thousands of DOM markers or an additional clustering dependency. Small colored category points are used rather than a separate icon asset system.
- ResizeObserver keeps the map sized after sheet/layout changes. Reduced-motion preferences suppress camera animation. Map instances/listeners/workers are removed on teardown; selection and connection changes do not recreate the map.

## Validation

- Full Vitest suite: **518 tests / 116 files passed**.
- Final focused map tests: **19 passed** after the last deduplication/click-priority changes.
- Includes correct numbering/GeoJSON order, missing coordinates, single stop, date line, mixed sources, 5,000-location data, linked records, renderer lifecycle, load/error/retry, selection, detail links, owner/editor/viewer routes, unauthorized/draft rejection, restricted map projections, atomic ordering, stale revisions and management-field denial.
- Browser: **6 checks passed** across desktop/mobile using synthetic trip records and the real MapLibre worker/OpenFreeMap style. Includes fully rendered maps, marker selection via list, linked booking navigation, mobile sheet, connection toggle, no horizontal overflow and deliberately blocked-provider fallback.
- Lint: passed. TypeScript: passed. Production build: passed. An earlier build paused on the existing Next.js security-upgrade advisory; retry passed. No dependency security upgrade was bundled into this feature.
- Screenshots: `tests/screenshots/trip-map/{desktop,mobile}/{dashboard,explorer}.png`.
- Tests never wrote to the connected database. SQL tests used PGlite and synthetic authenticated users, not live Google accounts. Actual live schema availability and live two-account behavior are not claimed verified.

## Files changed

App: `app/trip-map-actions.ts`, `app/trip-map.css`, `app/layout.tsx`, `app/trips/[id]/page.tsx`.

Components: `trip-map.tsx`, `trip-map-canvas.tsx`, `trip-overview.tsx`, `trip-overview-view.tsx`, `discovery.tsx`, `intelligence.tsx`; removed unused `google-map.tsx`.

Data/config: `lib/trip-map.ts`, `trip-map-data.ts`, `map-config.ts`, destination ordering integration in `trip-overview.ts` and `itinerary.ts`; package manifests, `scripts/sync-map-worker.mjs`, generated public worker/license and scoped lint exclusion.

Verification: six `tests/trip-map*.test.*` files, `tests/browser/trip-map.spec.tsx`, three browser fixture modules, Playwright map registration/software-rendering option, screenshots and this note.

## Release handoff

1. Review the local changes and migration 023. Maps can ship without 023; ordering stays disabled until it is explicitly applied.
2. Verify the intended live project has the existing location/schema and authorization dependencies. No migration status was assumed from local files.
3. Confirm a compatible build runtime, build-generated worker inclusion, public style access and production browser WebGL support. Provider outages must keep the list usable.
4. Address the existing Next.js security advisory as a separate approved maintenance change.
5. Obtain explicit approval for migration application, push/merge and deployment. None was performed. After release, test Owner/Editor/unauthorized access using disposable records, including an unshared private file.
