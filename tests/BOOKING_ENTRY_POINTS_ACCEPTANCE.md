# Booking uniformization — actual entry points

17 November 2026. Local implementation only. No migration, live data write, deployment, push or merge. Existing map, destination and collaboration work was preserved.

## Finding and correction

The previous browser tests assembled their own booking-page fixture; they did not execute the production `BookingBudget` composition. The audit traced the real owner path: `BookingBudget` creates `BookingsClient` with a server-provided `BookingCollectionClient` child; `BookingManager` showed that collection for Owners, while Editors used `BookingManager.edit`. Both already rendered `BookingEditor` in current source, but had different manual-creation adapters and category initialization. No independently rendered old Name/Address booking form was found in this checkout. The precise cause of the reported old form in the user's existing browser session remains unverified; localhost's listening process was confirmed to use this repository. No caching diagnosis is claimed.

Existing-trip manual creation now uses `BookingManager.edit` for both Owner and Editor. A small context connects the server-composed owner's collection button to that handler. The sole fields implementation remains `BookingEditor → SimpleBookingFields`, used also by Create Trip and upload/intake review. Stays now supplies its accommodation category to the new editor. Legacy `BookingForm` creation links open `?view=bookings&edit=new` directly; saved IDs still open their own record.

The owner's existing ability to save an unfinished manual entry is preserved: if required booking dates are missing, the same editor saves through the existing owner-private booking intake with Needs review, then refreshes. No fake dates or finalized booking are created. Editors keep existing finalized-booking validation and permissions. Uploaded files, unfinished entries and their review workflow remain in the existing collection.

## Entry-point audit

“Canonical” means `BookingEditor → SimpleBookingFields`, not a duplicated fields implementation. Browser checks below run desktop and mobile with local auth/database/action doubles.

| Entry point / real route or handler | Before | After | Verification | Canonical? |
|---|---|---|---|---|
| Create Trip Step 2 Add manually: `app/trips/new/page.tsx` → `BookingCollectionClient` → `BookingCollection.onManual` | Collection editor/private intake | Same collection editor/private intake | Browser save/reopen, categories, search, currency/payment | Yes |
| Create Trip uploaded booking Review/Edit: `BookingCollection.openEditor` | BookingEditor | Same | Browser upload/review/retry and draft isolation | Yes |
| Existing Trip Owner Add manually: `BookingBudget` → owner collection child | Collection.onManual → collection editor | Context → BookingManager.edit → ManagedBookingEditor → BookingEditor | Production server composition executed; Overview→Bookings→manual→Stay→save→reopen/remount, desktop/mobile screenshots | Yes |
| Existing Trip Editor Add manually: `BookingManager` → `BookingOptions.onManual` | BookingManager.edit → ManagedBookingEditor | Same handler as Owner | Production-composed browser save/reopen | Yes |
| Saved booking title / Edit / Review menu: `BookingManager.edit` | ManagedBookingEditor → BookingEditor | Same | Browser saved selection/manual rename, edits, invalid dates, persistence | Yes |
| Saved booking details Edit button: `BookingManager.edit(selected)` | ManagedBookingEditor | Same | Existing details/browser and shared-editor regressions | Yes |
| Existing Trip pending manual/uploaded entries: `BookingCollection.openEditor` | BookingEditor | Same | Browser intake/review/retry; owner unfinished-entry regression | Yes |
| Trip Overview Bookings pill/module | Link to `?view=bookings` then owner/editor path | Same link, unified manual adapter | Actual TripOverviewView pill click through production BookingBudget, desktop/mobile | Yes, after navigation |
| During-trip booking event: `DuringTripSections` → `?view=bookings&edit=<id>` | BookingManager saved editor | Same | Source traced; target saved-editor route tested; during-trip event itself not rerun here | Yes |
| Completed-trip Bookings module: overview modules | Bookings route | Same | Source traced; shared target route tested; completed-dashboard click not separately rerun | Yes, after navigation |
| Itinerary Manage bookings link: `ItineraryView` toolbar | Bookings route → manual action | Same route → unified action | Actual ItineraryView click → production booking composition → Stay, desktop/mobile | Yes |
| Itinerary saved booking Edit/View: `ItineraryView` booking card; `DayBookings` | `?view=bookings&edit=<id>` → ManagedBookingEditor | Same | Source traced, server route/saved-editor browser tests; each DayBookings link not separately clicked | Yes |
| Stays: Hub `view=stays` → BookingBudget with initialCategory accommodation | Owner collection could open generic new type | Shared manager opens Stay by default; saved plans stay separate | Actual BookingBudget Stays composition, desktop/mobile save/reopen; Hub role/route unit coverage | Yes |
| Transport/Experience category inside booking drawer | Shared category fields | Same fields through canonical creation/editing | Browser Transport/Experience/Stay/Other and payment/date tests | Yes |
| Expanded Map booking list/marker: TripExplorer.select/button/Link → MapPoint.href | `?view=bookings&edit=<id>` | Same → shared editor | Actual TripExplorer View booking link → production BookingBudget → saved Stay; desktop/mobile (canvas stubbed) | Yes |
| Legacy exported BookingForm wrapper (not mounted by current pages) | Compatibility link to bookings list, or saved edit ID | New links include `edit=new`; saved IDs retained | Wrapper href unit and Hub route coverage; direct compatibility link not separately browser-clicked | Yes, at target |
| Old `view=import` route / exported BookingImport wrapper | Redirect/link to Bookings | Preserved | Source traced; current upload flow browser-tested | Yes, at target |

`QuickAdd`, `SegmentForm`, itinerary Add activity, saved legacy stay plans and Transport plan editing write **trip_segments**, not bookings. They remain itinerary/idea editors; converting those records into reservations would remove existing functionality. Research/Discovery save places/ideas and have no booking form. The generic `saveEssential` and old `saveReviewedBooking` actions remain authorized compatibility actions; no current booking-field UI renders through them. No second booking fields implementation was introduced.

## Rendered behavior

Stay displays one searchable **Where are you staying?** field. Selection retains verified name/address/identifier/coordinates, hides the redundant address input and preserves custom booking titles. Manual names keep the optional address fallback. Experience/Transport/Other retain contextual fields. EUR/USD/RON, Paid/Pay later/Not set and conditional property/deadline options use the same field and validation logic at every booking editor entry.

Payment persistence and linked reminders still require previously prepared **025**. It was not applied or altered in this correction. Real deployments without its capability keep those controls disabled; mocked-ready browser coverage does not assert the live schema is ready. No new migration is required by this entry-point correction.

## Verification and boundaries

- Production composition browser harness imports actual `BookingBudget`, `BookingsClient`, `BookingCollectionClient`, `BookingManager`, `BookingCollection`, shared editor and fields. Auth, Supabase calls, server actions and Next router transport are replaced locally.
- It clicks actual TripOverviewView, ItineraryView and TripExplorer link/button handlers. Map canvas is stubbed; no live map provider is needed.
- Save/reopen/remount checks use session-local synthetic records. This is not a write-based authenticated test against the connected live Supabase project.
- The final verification totals are recorded below. No production-readiness claim is based solely on mocks.

## Files changed in this correction

`components/shared-booking.tsx`, `components/booking-collection.tsx`, `components/booking-manager.tsx`, `components/booking-budget.tsx`, `components/booking-budget-client.tsx`, `components/essentials/forms.tsx`; new `tests/browser/booking-entry-points.spec.tsx` and `tests/fixtures/booking-entry-{browser,runtime}.tsx`; `playwright.config.ts`; booking fixture, wrapper, route and owner unfinished-entry regression tests. Other existing working-tree changes predate this correction.

## Screenshots

- `tests/screenshots/booking-entry-points/desktop/existing-trip-manual-stay.png`
- `tests/screenshots/booking-entry-points/desktop/existing-trip-manual-payment.png`
- `tests/screenshots/booking-entry-points/mobile/existing-trip-manual-stay.png`
- `tests/screenshots/booking-entry-points/mobile/existing-trip-manual-payment.png`

These show the real production-composed drawer with synthetic trip/booking data. Existing unrelated tracked screenshot artifacts regenerated during tests are restored.

## Final results

- Lint and TypeScript: passed. Generated duplicate Next route declarations were moved out of `.next` before the standalone typecheck; no application source or real data was deleted.
- Unit/isolated database suite: **543 passed, 122 files**.
- Booking/creation browser suite: **50 passed**, desktop/mobile. Expanded entry-point suite including map navigation: **8 passed** (six overlap the 50-check run; 52 distinct cases across both runs).
- Production build: passed on retry after the recurring existing Next.js advisory. No dependency upgrade was made.
- Local existing-trip manual Stay creation, currency/deadline persistence, Owner/Editor/Stays/Create Trip parity, itinerary navigation and map→saved-editor navigation are confirmed. The user's already-open authenticated browser session and live schema were not inspected; the reported old form was not reproduced from the current source. If it remains visible there, compare the exact URL/build with this local checkout before making database changes.

## Follow-up: generic Name autocomplete

The screenshot showed the **Other** booking category, whose Name had remained plain text while Stay/Experience used autocomplete. The generic Name now uses the same SmartBookingName component, with booking-only Other search combining lodging and experience POIs. Destination search is unchanged. Its separate Location details/Address section is removed; existing addresses remain saved and visible as summary text. Existing titles remain intact on load; typing/selecting is an explicit name edit, and changing an associated place clears stale coordinates. Manual names need no match. Transport endpoints and the previously approved Stay/Experience fields remain unchanged.

Changed: `components/simple-booking-fields.tsx`, `components/smart-booking-name.tsx`, `lib/simple-booking.ts`, `lib/booking-place-search.ts`, `lib/worldwide-locations.ts`, `lib/automatic-zones.ts`, booking-mode validation in `app/api/locations/route.ts`, and regression/browser tests. No migration is needed for this follow-up.

A single public, read-only Photon request for Casa Vimaya returned **Casa Vimaya Riverside Hotel**, classified as a hotel with street and real coordinates. Automated tests use clearly isolated mocked responses, not live writes. The entry-point browser suite passed **10 desktop/mobile checks**, including the Name dropdown and saved address/coordinates. Captures: `tests/screenshots/booking-entry-points/{desktop,mobile}/name-casa-suggestions.png`.

Follow-up validation: **545 unit/isolated database tests**, **10 desktop/mobile entry-point browser checks**, lint, TypeScript and production build passed. Build passed on retry after the existing Next.js advisory. No migrations or live writes were performed.
