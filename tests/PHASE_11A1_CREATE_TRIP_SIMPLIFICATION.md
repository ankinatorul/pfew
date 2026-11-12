# Phase 11A.1 — Create Trip simplification

Implemented locally on 12 November 2026 in the existing three-step `/trips/new` flow. No deployment, push, merge, live test writes, migration application, key/configuration changes or paid provider calls. Earlier uncommitted Phase 9/10 work is preserved. Pre-phase source checkpoint: `/private/tmp/pfew-before-phase11a1/source/`.

## 1. UX changes

- The existing progress indicator remains consistent across Trip Basics → Add Bookings → Travel Style & Review → Success → Open my trip. Compact, accessible top Back arrows replace bottom Back buttons. Step 2 has one Continue action, including with no bookings or unfinished entries; no Skip button or skip dialog.
- Basics shows name, ordered destinations and both required dates. A single destination has no redundant number/reorder/remove toolbar. Multiple stops retain ordering, removal and focus handling. Validation shows the first useful message and retains field error associations.
- Step 2 offers a multiple-file drop/browse area and a balanced manual-entry card, side by side on desktop and stacked on mobile. File feedback/retries, consented extraction and original retention reuse the existing pipeline.
- A manual entry opens the existing inline editor, now using compact contextual fields. Optional stay times and place lookup are disclosures. Closed editors do not require a long visible form. Name-only or undated bookings can be saved and continued as Needs review. Normal booking date requirements remain unchanged.
- Cards show available name/date/cost/payment information, a review indicator and relevant actions. The final review stays inside Step 3; Budget/Balanced/Premium, edit actions, cheerful success and explicit Open my trip remain.
- All changes use the existing full-width canvas, shell, Manrope, compact cards, Lavender accents and Lime actions. No new images, dependencies, page wrapper or theme system.

## 2. Removed copy and controls

Removed repeated stop-order/date instructions, visible coordinate controls from Create Trip, prominent time-zone explanations, bottom Back controls, Skip for now, visible collection counters, repeated provider/date/reservation-missing paragraphs, the theme banner/descriptions and success theme label. User-facing setup notices avoid database/provider jargon. Optional source evidence, required provider consent and discreet accessible Photon/OpenStreetMap attribution remain.

## 3. Files changed in this phase

Application:

- `components/trip-basics.tsx`: shared top Back control and simpler basics.
- `components/booking-collection.tsx`: existing transport, revisions, file/review operations and navigation with new presentation; shallow legacy-field preservation and explicit selected-place dirty tracking.
- `components/simple-booking-fields.tsx` (new): contextual presentation, existing place picker, optional times/place lookup, payment controls.
- `lib/simple-booking.ts` (new): explicit type mapping, rendered-field overlay, preserved numeric values and compact reliable summaries.
- `components/location-picker.tsx`: opt-in compact mode; original coordinate workflow remains available to existing non-Create-Trip callers.
- `lib/worldwide-locations.ts`: concise contexts, destination ranking/filtering and conservative deduplication; existing provider, limits, debounce, cache, abort and fallback infrastructure retained.
- `components/trip-review.tsx`: concise review and success with hidden theme information; original finalization/active-trip client remains unchanged.
- `app/trips/new/page.tsx`: read-only capability probe for the optional payment-deadline column.
- `app/api/booking-collection/route.ts`: deadline validation/schema gate and preservation of unchanged owned-entry zones/legacy location context during review.
- `app/create-trip.css`: scoped compact controls, upload cards and responsive editor fields.

Prepared SQL and verification: `supabase/migrations/017_booking_payment_due.sql`, `supabase/VERIFY_PHASE11A1_READ_ONLY.sql` (both new). Existing migrations 001–016 are unchanged.

Tests: new `tests/simple-booking.test.ts` and `tests/simple-booking-client.test.tsx`; updated worldwide search, booking collection API/database tests, trip basics/collection/review browser contracts and their existing fixtures. New screenshot gallery and this report. Generated Next declarations and screenshots recaptured for previous phases are restored to their pre-phase versions after verification.

## 4. Destination search

Photon/OpenStreetMap remains the worldwide provider, with the existing local city dataset as fallback. No provider key, billing or service was introduced. Destination scope excludes street/house-level results, prioritizes settlements/geographic destinations over minor subdivisions, and keeps region/country context concise. Ao Nang's preferred fixture label is **Ao Nang, Krabi, Thailand**. Place scope still supports hotel/pickup/drop-off lookup.

Duplicate OSM objects and same-name near-identical points are filtered. A nearby local-city fallback with the same full region/country label yields to the Photon representation. Distinct provider objects and different regional namesakes remain; lower-ranked same-label kinds receive a discriminator rather than renaming the preferred destination. Search tests cover accented/non-Latin names, islands, regions, national parks, ambiguous names and the Ao Nang regression.

No geocoding result or coordinate is invented. An unsupported destination offers spelling/country/nearby-town recovery while retaining the user's query. **Free-text-only Step 1 destinations are not supported by the existing verified-coordinate draft contract.** This phase therefore does not offer a misleading unverified save or weaken that contract. Existing non-creation map-position functionality is retained. Optional booking locations can use simple typed place/address text without a geographic ID.

For a Stay, opening Location uses the entered hotel name as an initial search query when no saved location exists. The user focuses the result field and explicitly chooses a match; nothing is silently assigned. Typed location text remains available when no reliable match exists. This is general place geocoding, not a new hotel inventory/availability service.

## 5. Booking field mapping

| UI                                 | Existing stored fields                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Stay                               | `accommodation`; start/end dates, optional local/end times                                                                              |
| Transport                          | New entries use `ground transport`; existing flight/ferry/car rental/ground transport subtype is retained when the UI type is unchanged |
| Experience                         | `activity`                                                                                                                              |
| Other                              | `other`                                                                                                                                 |
| Name / reference                   | `title` / `reference`                                                                                                                   |
| Optional place / pickup / drop-off | Existing location IDs/labels/points/zones when selected; typed `destination` or transport `origin`/`destination` when unverified        |
| Cost / currency                    | Existing `price` / `currency`; no default price; currency initially uses the saved trip currency                                        |
| Paid / Pay later / Unknown         | Existing `paid` / `unpaid` / `unknown`; an existing `partial` value remains visible and intact                                          |
| Payment due                        | Dedicated nullable `bookings.payment_due_date`, requiring reviewed 017                                                                  |

Name is required when saving from the compact editor; its selected type maps explicitly. Unknown dates/costs stay unknown. A single-date non-stay event uses that explicitly supplied day as its complete range; stays never infer checkout and trip dates are never copied into reservations. If existing full booking validation cannot pass, Save booking stores the entry as Needs review instead of inserting an invalid normal booking. Fully valid entries can be reviewed/materialized through the original workflow. The normal detailed editor remains available in Bookings.

## 6. Payment and Budget

Payment defaults to Unknown. Pay later reveals an optional deadline. Selecting Paid does not synthesize a paid amount, expense or payment transaction. Legacy partial payments remain preserved. Costs and original currencies stay in the existing model; Phase 9 continues to calculate actual spending from recorded expenses only. Existing expense/booking associations and allocations are untouched; there is no automatic expense creation or FX conversion.

017 adds one nullable date column and one invoker trigger function/trigger to transfer the dedicated deadline from the owner's existing intake during the same booking insertion transaction, before that intake is removed. Existing materialization/finalization RPCs are reused, not replaced. No rows are backfilled or reclassified and no reminders are automatically created. Anonymous/public trigger-function execution is revoked. A missing column disables deadline entry and the API rejects unsupported deadline saves rather than losing them silently.

## 7. Preservation and security

The compact form overlays only rendered fields on the owned entry; unchanged numbers retain their original representation. Provider, notes, traveler details, paid amounts, source/checksum, reservation status, segment association and unknown legacy fields remain. Unchanged saved time zones and legacy location metadata survive server normalization; changed verified IDs still resolve through existing geographic validation. Reviewing never changes reservation confirmation.

Existing owner-scoped draft saves, stable IDs, revision conflicts, retry protection, collection source checks, private Storage, extraction consent, atomic finalization and active-trip selection remain. Back/Continue save unsaved changes sequentially. Unfinished bookings and stored originals survive finalization. Uploading makes no AI call. Originals are not deleted after reading/metadata failures. Full detailed controls and existing deletion confirmations are retained where relevant.

## 8. Schema dependencies and live status

The owner-provided read-only reports reviewed immediately before this work showed expected 010–014 objects present and 015/016 objects absent. Those are snapshots, not a fresh privileged live inspection. This phase applies nothing. Draft/collection/finalization depend on the existing 010–014 contracts; absent prerequisites keep saving gated. 015/016 remain separate Phase 9/10 dependencies. 017 is only necessary for the new dedicated payment deadline, not for the simplified layout or ordinary payment choices.

The shared live project remains intentional. Previous recovery and excess-TRUNCATE-grant findings remain unresolved by this UX phase. Review the existing migration guide/security report before any live application; do not replay old migrations or assume new schema exists. The optional Phase 11A.1 read-only check works before/after 017 and compares original booking fields without exporting personal rows.

## 9. Verification

- `npm run lint` and `npm run typecheck`: **passed**.
- `npm test -- --maxWorkers=2`: **406 tests in 94 files passed**.
- Full browser suite: **102 desktop/mobile cases passed**, including earlier approved screens. The final two new cases are rerun after explicit hotel lookup/location persistence and narrow-date refinements.
- `npm run build`: **passed**.

New tests cover all four mappings, legacy field/numeric preservation, optional dates and costs, payment defaults/gating, clear summaries, and API deadline validation/schema failure. The isolated PostgreSQL test executes actual 017 SQL twice, checks before/after read-only fingerprints and anonymous denial, preserves historical rows, retains private files, enforces existing owner isolation, transfers the deadline once on materialization and verifies no expense was created. Existing draft/RLS/finalization/itinerary/finance/private-file suites remain in the full run.

Browser fixtures exercise required trip dates, keyboard search, multiple stops, draft recovery and independent drafts, drop/browse/multiple uploads, retained originals after extraction failures, contextual forms, hotel selection/manual address, pickup/drop-off, payments/deadline persistence, incomplete booking retention, no-booking Continue, top Back/edit navigation, hidden themes, style persistence, duplicate clicks, stale/failure recovery and explicit new active-trip opening. Responsive and overflow checks cover 320/375/390/768/1440/2560px across the retained suites. Native input/disclosure focus and labels are tested; no new dialog focus trap is needed.

No live authenticated write-based or paid-provider end-to-end tests were performed. Mocks cannot certify current live credentials, provider coverage/availability or custom live policies. Duplicate byte-identical generated `.next` declarations encountered during checks were archived privately, not excluded by weakening TypeScript settings.

## 10. Screenshots

Sixteen fictional-fixture captures: desktop/mobile Basics, destination results, Add Bookings, Stay, Transport, booking cards, final review and success. See [gallery](screenshots/phase11a1/README.md). Compared with the approved direction: existing Cobalt shell, off-white canvas, Manrope, Lime actions, Lavender upload gradient, individual rounded cards and full-width content remain. Mobile options stack and optional inputs disclose progressively. Fixed mobile navigation appears at its captured viewport position in full-page images.

## 11. Remaining limitations

- Unknown booking dates stay in the existing unfinished collection; normal booking/itinerary rows still require sufficient known scheduling information. This is intentional, not a claim that the reservation is missing.
- Free-text-only trip destinations require a separate approved contract/schema decision. For now choose a verified nearby geographic destination if the exact place cannot be found; no map coordinates are required in Create Trip.
- Payment deadlines require reviewed 017. Future full-manager deadline editing/display and deadline-specific reminder automation are outside this Create Trip pass; no unrelated booking/budget screen was redesigned.
- Geocoding matches are suggestions, not hotel identity/availability guarantees. Selecting one is always explicit.
- Unsaved typing is preserved by Back/Continue/Save, not automatically persisted on every keystroke. Refresh restores saved progress; an unsent original still needs recovery/reselection under the existing workflow.
- The existing inline editor is retained rather than adding a new modal system. Optional disclosures reduce visible fields; an expanded mobile editor still scrolls.

## 12. Next step

Review this Create Trip pass and the screenshot gallery. Separately review the pending migration/security/recovery handoff before enabling new schema features. Theme visual behavior and curated imagery remain deferred to Phase 11C. No further phase, deployment, push or merge is included.
