# Smart booking Place — acceptance

Implemented locally, 17 November 2026. No live database writes, migrations, deployment, push or merge. Existing destination and map work in the working tree was preserved; this change does not alter Destinations UX.

## Implementation and reused infrastructure

Stay and Experience use one primary **Place** input in the existing shared BookingEditor/BookingDrawer. It retains compact five-result autocomplete, destination proximity, debouncing, cancellation, keyboard/touch selection, loading feedback and optional manual entry. Transport retains its separate endpoints; Other retains Name. The same editor is used by Create Trip and existing-trip Bookings, including the existing Stays entry point. Itinerary, Overview and map booking links continue to open that editor.

Selected Place supplies the default booking title, saved location label/identifier, verified coordinates and timezone. Available provider street-address components populate the existing address field. Optional address and custom booking-title controls live under “Address & booking details (optional)”; neither requires a second place search. Experience retains date and optional time; existing Stay date-order validation and payment fields remain.

## Compatibility and persistence

No schema change is required. UI-only `booking_place` is excluded from persisted booking fields. Existing `title`, `location_label`, `destination`, `location_id`, latitude/longitude and timezone fields are reused. Saved geographic identifiers are decoded for display without geocoding. Unchanged opaque legacy identifiers are preserved in Create Trip review without attempting to resolve them again.

Existing distinct custom titles and addresses survive edits and selection. Address provenance is not stored in the schema: ambiguous saved nonempty addresses are conservatively retained and remain editable. Changing a linked Place clears stale identifiers/coordinates. Manual text remains valid, keeps its label and creates no map pin. Existing map markers continue to use saved coordinates; no location records are duplicated.

The existing authorized actions/RPCs and revisions are reused. An isolated two-user database regression verifies Editor creation/editing of the same booking, Owner visibility, stable ID, unchanged private attachment metadata, actual map-coordinate use, and denial for an unrelated account. Private file permissions are unchanged.

## Files changed for this correction

- `components/simple-booking-fields.tsx`, `components/smart-booking-name.tsx`, `components/shared-booking.tsx`
- `lib/booking-place-fields.ts` (new presentation helper), `lib/simple-booking.ts`, `lib/automatic-zones.ts` (booking normalization only), `lib/worldwide-locations.ts` (booking-only address presentation)
- `app/api/booking-collection/route.ts`, scoped booking rules in `app/create-trip.css`
- Tests: `booking-place-fields.test.ts`, `smart-place-persistence.test.ts`, `smart-booking-name.test.tsx`, `booking-place-search.test.ts`, `automatic-zones.test.ts`, `booking-collection-api.test.ts`, `simple-booking-client.test.tsx`, `unified-booking-client.test.tsx`; browser booking-budget, booking-collection and trip-review suites.

Other pending working-tree files belong to earlier map/destination work and are not part of this correction.

## Verification

- Unit and isolated database/RLS suite: **538 passed, 120 files** (`npm test -- --maxWorkers=2`).
- Browser: **42 passed**, desktop and mobile (`npx playwright test tests/browser/booking-budget.spec.tsx tests/browser/booking-collection.spec.tsx tests/browser/trip-review.spec.tsx --workers=2`).
- Lint and TypeScript: passed.
- Production build: passed on retry. The first attempt emitted an existing Next.js security/upgrade advisory; no dependency upgrade was made as part of this work.
- Synthetic desktop/mobile captures: `tests/screenshots/smart-booking-place/{desktop,mobile}/attraction-selected.png`. Existing tracked screenshots regenerated during tests were restored.

Coverage includes selection/address mapping, manual entry and provider failure, keyboard interaction, one visible primary Place field, custom-title/address preservation, legacy locations, stale-coordinate removal, zero coordinates, date validation, existing journey persistence and Owner/Editor access. Browser and provider responses are fixtures: this is not verification of current live hotel coverage or a live two-account acceptance test.

## Limitations and handoff

The existing Photon/OpenStreetMap provider is reused; POI coverage depends on its index and response metadata. No paid service, new key or extra provider is introduced. Address components are used only when actually supplied ([Photon API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md)); otherwise the geographic label is retained. There is no standalone Restaurant category; relevant restaurant POIs remain under Experience.

This correction adds no migration dependency. Existing booking features still depend on their previously prepared/applied schema and capability checks; this task does not assert that live migrations are installed. Stop for product review.
