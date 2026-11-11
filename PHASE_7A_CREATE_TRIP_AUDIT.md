> Historical audit. The POC decision of 10 November 2026 supersedes its optional-date target: both trip dates are now required before Step 1 can continue. See tests/PHASE_7B_DRAFTS_ACCEPTANCE.md.

# Phase 7A — Create Trip UX audit

**Scope:** repository inspection and existing isolated tests only. Phases 2–6, production code, database schema/data, migrations, environment files, and dependencies are unchanged. The approved journey needs changes to data contracts and persistence as well as UI; this report does not authorize or implement them.

## 1. Current user journey

Entry is `/trips/new` from Home/sidebar/My Trips. [The route](app/trips/new/page.tsx) calls [access](lib/access.ts), then probes `trip_segments.location_id`. Any probe error produces a migration-005 notice, potentially misdiagnosing connection failures.

There is **no separate first-user onboarding wizard**. `/setup` is infrastructure setup for an unconfigured installation. Google sign-in normally returns Home. The Create Trip access guard redirects to `/login` without `next`; safe return-path support exists, but that entry does not preserve Create Trip continuation. See [callback](app/auth/callback/route.ts) and [login](app/login/page.tsx).

The shared [TripForm](components/forms.tsx) currently has four screens:

| Screen | Actual behavior |
|---|---|
| The essentials | Name optional; blank becomes “Untitled adventure.” Departure and return dates required. Timezone is hidden/automatic. |
| Destinations | Zero to 32 stops; the entire step can be skipped. Each added stop requires a resolved location and arrival/departure dates within the trip. Add/remove/reselect supported; no explicit reorder control. |
| Your style | Travelers defaults to 1; Budget / Comfort / Luxury, default Comfort; optional overall budget, currency default EUR. |
| Ready to go | Static explanatory copy, rather than a summary of entered values. “Create my trip” submits all fields. |

Destinations use [LocationPicker](components/location-picker.tsx): debounced worldwide Photon search, local city fallback, keyboard suggestions, loading/error/empty feedback, and manual coordinates/full-map-pin entry. [Resolution](lib/locations.ts) supplies canonical identity, coordinates, and timezone. Stop dates initially copy trip dates but do not automatically follow later trip-date edits; validation rejects out-of-range stops. Destinations remain editable in existing trip sections after creation.

[saveTrip](app/actions.ts) validates through [tripSchema / parseDestinations](lib/domain.ts), resolves locations again, and calls `create_trip_with_destinations`. The RPC atomically creates the owned trip and planned destination segments, without bookings. Success revalidates the shared layout and opens `/trips/[id]`.

Back/Continue preserve local state and mounted form inputs within the current visit. Steps are not URL/history states; there is no Create Trip draft hook, autosave, reload recovery, or leave warning. The step indicators are noninteractive spans. Client errors are inline; submission shows disabled “Saving…”. Server validation/persistence failures redirect to [the generic error page](app/error/page.tsx), whose return link opens Home rather than restoring the draft. There is no separate success screen.

**Bookings happen after creation:** `?view=bookings` supplies manual BookingForm; `?view=import` supplies [BookingImport](components/booking-import.tsx). Both require an existing trip.

- Text extraction reads explicit unambiguous labels, without AI. PDF/JPEG/PNG extraction is offered only with configured live AI and explicit consent: one document per request, ≤3 MB, ≤5 PDF pages or ≤20 megapixels. PDF inspection validates the file; it is not a non-AI PDF text/OCR extractor. See [extraction](lib/booking-extraction.ts) and [document validation](lib/import-document.ts).
- One request returns one booking preview with evidence, unknown fields, and warnings. Users correct the reused [BookingForm](components/essentials/forms.tsx), explicitly approve sharing, then save. There is no grouped multi-booking review. Imported unknown dates/currency stay blank, but saving still requires valid booking dates/currency.
- Extraction previews are temporary; originals/bookings are not saved automatically. Discard and inline extraction errors are supported. Source retention after extraction failure and recovery after a failed reviewed save need further testing. Save failures navigate away; no durable review draft exists.
- [Reviewed saves](app/booking-import-actions.ts) use an import key and SQL idempotency. Manual saves use [saveEssential](app/essentials-actions.ts). Neither makes a provider reservation. Original files can be separately attached privately to a saved booking through [UploadForm](components/essentials/attachment-form.tsx), [file actions](app/file-actions.ts), and the existing Storage authorization.

Desktop uses the shared shell and legacy `.form`: maximum 700px, 32px padding, paired date fields. At ≤700px, fields stack and padding shrinks; the stepper stays a compact flex row. This is CSS inspection. Signed-in mobile usability, focus movement, long-label overflow, and browser Back recovery remain unverified.

## 2. Approved target journey

1. **Trip Basics:** required trip name and at least one destination; multiple destinations; optional dates.
2. **Add Bookings:** optional uploads or manual records, with extracted information reviewed together inside this step.
3. **Travel Style & Review:** Budget / Balanced / Premium; meaningful trip review before creation; automatic destination theme selection without a mandatory theme picker.

First-time users must not pass through a separate onboarding wizard. These requirements supersede the older optional-name and Comfort/Luxury wording in [PRODUCT_SPEC §7](PRODUCT_SPEC.md).

## 3. What can be reused

- Existing route, authenticated shell, safe return-path helpers, owner-scoped creation, Supabase/RLS, and atomic destination RPC.
- LocationPicker, canonical location resolution, automatic timezone handling, and server revalidation of location IDs.
- Booking field validation, manual form fields, labeled-text/live extraction adapters, evidence/warnings, explicit review consent, and import-key idempotency.
- Private attachment limits, ownership checks, pending/ready recovery, and signed downloads—subject to deciding how pre-creation files are staged.
- Approved Manrope/tokens/buttons and existing responsive primitives. No new framework or dependency is indicated.

## 4. What needs to change

- Replace creation's four screens with the three approved steps and a real review of entered details. Keep approved Edit Trip behavior intact: it currently shares TripForm, tripSchema, and saveTrip with creation.
- Enforce required name/destination specifically for creation; replace date-required assumptions with an approved unknown/partial-date contract across client validation, server validation, and persistence.
- Compose optional manual/uploaded bookings and grouped review before final creation. Reuse extraction and validation; the existing post-creation APIs/forms cannot simply be embedded unchanged.
- Define honest reading/saving/retry/skip/cancel/partial-failure states, draft recovery, and accessible step/focus navigation. Do not claim a draft or upload is saved without persistence.
- Implement the approved style vocabulary and automatic destination-theme rules after the unresolved mappings are approved. No trip-theme selector, theme field, or destination-to-theme resolver was found.

**Coverage:** 27 existing tests across 9 files passed: `tests/forms.test.tsx`, `guided-database.test.ts`, `locations-database.test.ts`, `essentials-forms.test.tsx`, `booking-extraction.test.ts`, `booking-import-route.test.ts`, `booking-import.test.tsx`, `research-import-database.test.ts`, and `navigation-invalidation.test.ts`. These cover forms, atomic creation, extraction/review, idempotency/RLS, and navigation using mocked services or isolated PGlite, without real trip writes or paid extraction.

There is no authenticated Create Trip browser journey covering three steps, optional dates, staged bookings, resume/retry, or final review. Existing auth browser tests check signed-out protection; trip-management browser tests exercise editing fixtures. `tests/browser/setup.spec.ts` exists but is excluded by current Playwright `testMatch` and tests infrastructure setup, not user onboarding. No new tests, build, or production changes were needed for this audit.

**Figma evidence:** no local Figma flow exports or Code Connect mappings were found. The [previously supplied file](https://www.figma.com/design/N5keKvebttagianCcYjrWm) exposed “Page 1”; its subtree request then hit the Figma MCP Starter tool-call limit. Specific Create Trip frame names and flow equivalence cannot be verified. Repository flow evidence is the four-step form and older product documentation, not a confirmed implementation of named Figma frames.

## 5. Decisions requiring approval before implementation

The three-step structure and required/optional fields above are settled. The following details are not:

| Decision | Approval needed |
|---|---|
| Optional-date semantics | Allow neither date, departure-only, or other partial ranges? Are stop dates also optional? Can incomplete bookings be retained? Can booking dates propose trip dates, and how does the user approve them? |
| Booking staging and originals | How should bookings/extraction be authorized before a trip exists? Are originals temporary or retained privately after creation? Define removal/retention on cancel or failed creation; do not silently create an ordinary trip at step 1. |
| Batch review and conflicts | Supported upload/booking limits; multiple reservations in one source; duplicate handling; and reconciliation when extracted destinations/dates conflict with Trip Basics. No silent overwrite. |
| Draft/navigation recovery | Session-only state, reload recovery, or account/cross-device drafts? Define expiry and resume/leave behavior, including whether signed-out Create Trip entry should resume directly after sign-in. |
| Style and remaining fields | Approve UI-label aliases versus stored-value changes for Balanced/Premium and the default selection. Decide placement/defaults for existing travelers, budget amount, and currency fields not specified in the target. |
| Automatic theme rules | Which destination determines a multi-stop trip's theme, which mappings/fallbacks exist, and when edits recompute it? No mandatory picker is proposed. |

## 6. Technical risks and dependencies

- **Optional dates are a persistence blocker:** [foundation SQL](supabase/migrations/001_foundation.sql) requires trip/segment dates; [guided/location RPCs](supabase/migrations/005_automatic_locations.sql) insert dated destinations. Booking schemas also require dates. Existing overview fallback rendering does not make undated creation supported. Shared sorting, date formatting, itinerary constraints, budget-day checks, and offline records need a compatibility audit before any later approved contract change. Never substitute invented dates. No schema/migration change is made here.
- **Pre-trip bookings need an explicit commit design:** [import API](app/api/booking-import/route.ts) requires `trip_id`/`can_edit_trip`; paid requests reserve service budget against that trip. Storage attachments require real trip and booking IDs. The current atomic create RPC saves only trip/destinations; a series of later booking/file saves can partially fail. Final-create retries have no existing trip-creation idempotency token. Preserve review consent, RLS, quota checks, and truthful outcomes while resolving this.
- **Protect approved work:** isolate creation orchestration from shared editing/booking forms and actions. Do not globally rename stored styles or weaken existing validators to make the new UI pass. Balanced/Premium aliases might preserve legacy storage; canonical renaming would affect SQL, editing/Budget controls, and AI context.
- **Operational verification remains separate:** live AI/provider behavior, fresh Google continuation, deployed SQL/bucket policies, and signed-in cross-account flows were not verified. Preserve the current temporary-extraction/private-attachment distinction while future retention is decided.

## 7. Recommended implementation sequence

1. Review this audit and settle section 5; obtain exact Figma nodes if a flow comparison is required.
2. Specify optional-date and pre-trip booking/draft/commit contracts, including retries and file ownership. Seek separate approval for any necessary future backend/schema work; this audit does not authorize it.
3. Isolate Create Trip composition from Edit Trip; reuse field validators, locations, and approved shell/tokens.
4. Build Trip Basics against the approved date/location contract, without changing approved screen designs.
5. Add staged manual/imported bookings with grouped review and explicit skip/retry/cancel behavior; then implement Travel Style, automatic theme selection, real final review, and the approved final commit.
6. Validate with isolated unit/database/browser fixtures, desktop/mobile and keyboard checks, failure/reload/duplicate scenarios, and regressions for Phases 2–6 before requesting implementation review.

**Stop point:** audit complete. No redesign has been implemented; await review and approval.
