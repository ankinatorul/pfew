# Smart booking Name and Stay date validation

Completed locally on 14 November 2026. No migration, live Supabase write, paid API request, deployment, push or merge was performed.

## Implemented

Stay and Experience now use a single editable Name combobox in the existing shared booking drawer. It shows at most five POI matches plus a subtle “Use [typed name]” option. Selecting a result sets the name and existing location metadata together. The separate place finder is removed for these types; a compact optional address/details section remains. Transport retains a plain Name and optional pickup/drop-off pickers. Other retains a plain Name and optional free-text location details without a geocoder.

Custom names require no match, coordinates or place identifier. Empty results produce no validation error; an unavailable provider produces one short informational message and leaves manual entry/Save available. Enter without an explicitly highlighted option still permits the normal custom-name save. Arrow keys, Enter, Escape, pointer selection, native labels and combobox/listbox semantics are supported. Escape first closes open suggestions without dismissing the drawer.

Search starts after typing, uses a 400 ms debounce, aborts/ignores stale responses and never changes the input merely because results arrived. A small searching indicator appears during requests. Browser caching is bounded to 40 successful/empty searches, with no provider-failure cache; Retry-After cooldowns prevent repeated calls during throttling. The existing server cache, in-flight coalescing, four-request concurrency bound, timeout and provider cooldown remain shared with geographic search. No automatic paid fallback is used.

## Provider inspection and coverage

Pfew already has Photon/OpenStreetMap geocoding and a separate Google Places integration. No nonempty Google Places key was configured in the inspected local environment. Existing Google discovery/details endpoints use request-budget reservations and can incur provider charges; they are not invoked by this feature.

The implementation extends the existing Photon search service with an explicit booking POI mode rather than treating ordinary destination results as hotel matches. Lodging uses supported tourism/lodging tags. Experience accepts recognized attractions, museums, restaurants/cafés, historic places, parks and related POI tags. Administrative areas, streets and unknown business classifications are excluded from booking suggestions. Ordinary destination/place searches retain their existing behavior.

Only saved trip-destination coordinates supply bias: modern trips use ordered draft destinations; legacy trips can use saved destination-segment points. The first center biases the provider request; returned close-name matches are ranked against up to three saved centers. Bias is not a geographic restriction. Distinct same-name businesses remain separate; duplicate provider objects/equivalent records reuse the existing deduplication. No guessed city coordinates, confidence scores or business classifications are introduced.

Photon is an OSM geocoder with POI support, **not a comprehensive hotel or tour inventory**. Tags and indexed coverage vary. A custom hotel, private rental or tour can always be named manually. No new provider, key or billing setup is required for this optional feature.

Official reference: [Photon API: location bias, tag filters and POI response examples](https://github.com/komoot/photon/blob/master/docs/api-v1.md). The implementation uses compatible broad requests and filters returned principal OSM tags locally, avoiding dependence on deployment-specific categories or city-only layers. Dropdown results include unobtrusive OpenStreetMap attribution and a copyright link.

Two non-destructive live provider checks returned HTTP 200:

- `Ritz Paris`, biased near Paris: returned a `tourism=hotel` result named Le Ritz, alongside pastry-shop/restaurant and more distant results. This confirms relevant POI coverage, not an exact-name or exhaustive hotel guarantee.
- `Louvre`, biased near Paris: returned Musée du Louvre with `tourism=museum`, alongside a town and unrelated businesses.

The public-name/tag results are recorded in `tests/smart-booking-name-live-checks.json`. These were raw provider checks; automated UI tests use mocked responses and fixture identifiers, not live provider verification or production records.

## Metadata and compatibility

A selected result saves the provider-supplied point through the existing `location_id`, `location_label`, `latitude`, `longitude` and timezone normalization. The compatible geographic ID retains an OSM identifier when supplied. There is no new table or place-ID format. Existing location resolution/authorization and booking persistence remain in use.

Focusing an existing name does not search automatically or mutate metadata. Editing other fields preserves its saved association. An actual name change after selecting, or when editing a linked saved place, clears the primary association so a different custom name cannot retain the old coordinates. Legacy label/coordinate-only associations are cleared explicitly too; the managed save adapter no longer restores those after an intentional clear. Unchanged legacy fields, reservation/review state, attachments, itinerary links and expense relationships retain the existing protection.

The shared editor snapshots typed names and selected metadata together. Custom-only names carry no invented point or provider ID. Selecting a place does not create a booking, expense or itinerary entry, and never changes dates.

## Date validation

Stay check-out has a minimum equal to the entered check-in. An earlier check-out displays “Check-out must be on or after check-in.” beside the dates, with `aria-invalid` and an associated description. Previously saved invalid ranges are visible immediately and remain unchanged until edited. Save focuses the invalid check-out and blocks persistence; it does not silently repair dates. The same shared logic applies in Create Trip and existing-trip editors. Transport end dates also retain the common ordering validation. Database constraints and existing server validation remain unchanged.

## Files changed

- New `components/smart-booking-name.tsx`: optional free-text POI combobox, debounce, stale cancellation, keyboard/pointer support, bounded cache and attribution.
- New `lib/booking-place-search.ts`: POI classifications, saved search centers, proximity ranking and shared date-order copy.
- Updated `components/simple-booking-fields.tsx`: smart/plain Name by type, selection/rename behavior, optional location details, controlled date fields and inline validation.
- Updated `components/shared-booking.tsx`: name/location snapshot integration and shared invalid-date save protection.
- Updated `components/booking-collection.tsx`, `components/booking-manager.tsx`: saved destination context for both persistence adapters.
- Updated `lib/worldwide-locations.ts`, `app/api/locations/route.ts`: optional validated POI mode, proximity bias/ranking, isolated cache keys and accurate unavailable/empty behavior; existing search modes preserved.
- Updated `app/booking-budget-actions.ts`: honor explicit clearing of label-only legacy associations while preserving unchanged places.
- Updated `app/create-trip.css`: compact responsive suggestion dropdown and date-error styling.
- New `tests/booking-place-search.test.ts`, `tests/smart-booking-name.test.tsx`; updated managed-action regressions and the three booking browser suites.
- This report, live-check results and `tests/screenshots/smart-booking-name/` gallery. Older screenshot baselines and generated Next declarations are restored after checks.

## Verification

- `npm run lint`: passed, no warnings.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **438 tests in 98 files passed**, including existing isolated database/RLS suites. An earlier run encountered host/worker timeouts; the complete clean rerun passed.
- `npx playwright test tests/browser/booking-budget.spec.tsx tests/browser/booking-collection.spec.tsx tests/browser/trip-review.spec.tsx --workers=2`: **42 desktop/mobile cases passed**.
- `npm run build`: passed.
- `git diff --check`: passed.

New checks cover hotel metadata selection, attraction POIs, similar names, geographic bias, empty results, unavailable/rate-limited providers, custom names, stale response cancellation, legacy association preservation/clearing, keyboard selection, both creation contexts, invalid existing Stay ranges, minimum check-out dates and no automatic date repair. Existing booking, Budget, attachment privacy, draft/finalization and authorization regressions remain included. All write-based tests use isolated fixtures/mocks/PGlite, never the connected live Supabase project.

[Desktop/mobile screenshots](screenshots/smart-booking-name/README.md) show hotel suggestions, custom-name fallback during provider failure, and a selected attraction. These were visually inspected against the existing compact Pfew drawer.

## Limitations and handoff

- POI coverage depends on Photon/OpenStreetMap; some hotels, private stays and tours will not be found. Manual names remain fully supported.
- Only the first saved destination biases provider retrieval; up to three destinations rank the returned matches. This avoids multiple provider calls for every keystroke. It does not guarantee exhaustive coverage around every destination.
- No actual mobile-device keyboard or screen-reader audit was performed. Chromium desktop/mobile viewport, pointer and keyboard checks passed.
- No new Supabase migration or service setup is needed. Previously prepared migration 018 and its existing managed payment-deadline gate are unchanged; it was not applied here.
- No paid Google Places calls, new service integration or live booking modifications were made. Stop for review before any publication or unrelated work.
