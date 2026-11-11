# Phase 7C — booking collection and grouped review

Implemented locally on 10 November 2026. **No live migrations, test writes, deployment, push or merge.** The connected Supabase project also serves the live website. Migrations 010, 011 and the proposed 012 remain unapplied by this work. Phase 7D is not implemented.

## Delivered behavior

- Valid, mandatory-date Step 1 hands its existing private draft ID to Step 2 on the same `/trips/new` route. Existing Resume/Start New and multiple destinations remain intact.
- “Got bookings already?” offers multiple PDF/JPEG/PNG uploads, manual entries and the existing deterministic labeled-text parser. All items appear in one grouped review; each opens an inline editor using the existing booking fields.
- Cards display only entered/extracted details, individual review status, separate reservation status, saved-file links, missing-data messages, source evidence and warnings. No invented booking dates, prices, IDs or confirmations.
- Save unfinished accepts incomplete information. Mark details reviewed uses the existing booking schema, geographic/time-zone normalization and required-field validation. Invalid input stays editable. Reviewing never confirms a reservation.
- Back, Skip and Continue save edited entries before leaving. Step 2 can be empty or contain Needs review entries. Advancing records progress only: it does not finalize the trip or create ordinary bookings/itinerary items.
- Step 3 shows accurate reviewed/unfinished counts and a truthful Phase 7D placeholder, with links back to bookings/basics.
- Finalized trips' existing Bookings section shows the owner's retained unfinished collection. Reviewing an entry there uses the existing reviewed-booking RPC to create its ordinary booking and retain its source links. Other members cannot see the owner's private intake or source files. Finalization itself remains future work.

## Existing infrastructure reused

- Phase 7B draft IDs, validated basics, RLS, lifecycle state and routing; no second trip state store.
- The already observed `trip_onboarding.preferences` store for temporary pending bookings; unrelated preference keys are preserved. This avoids weakening required fields in normal bookings or introducing another booking table.
- Existing `BookingForm` fields extracted into shared `BookingFields`, existing `Fields` renderer, `LocationPicker`, automatic time zones and `bookingSchema`. Normal booking creation/editing continues through its existing form/actions.
- Existing `/api/booking-import`, deterministic `extractLabeledText`, document reader, configured AI extractor and consent/quota workflow. Upload alone makes no paid request. AI reading requires explicit consent and an already configured provider; no new key, service or dependency.
- Existing private `booking-files` bucket, upload reservations, file type/size checks, signed-download endpoint, owner-scoped metadata, cleanup helper, and `save_reviewed_booking` transaction.

## Persistence and recovery

Each entry has a stable UUID, immutable source reference/checksum and per-entry revision. `save_booking_intake` locks the existing onboarding record, preserves other entries/preferences, accepts identical retries and rejects conflicting changes. Drafts are separated by trip ID and owner. Browser state is an editor cache; persistence is in Supabase, not fabricated browser-only success.

Uploads first save source metadata, reserve a private attachment, upload without overwrite, download/check SHA-256, then mark ready. A lost upload response can recover the same source without creating another entry. If storage is unconfirmed, the interface says so. After reload, Check saved upload verifies receipt; reselecting the original is necessary only if its bytes never reached storage, not because extraction failed.

Extraction reads the existing stored original. Failure keeps the source and reliable fields, marks the item Needs review and offers manual correction/retry. Successful retries fill blanks; conflicting existing corrections are retained with warnings. Removal requires confirmation, deletes stored files before metadata, and retains a retryable removal marker if cleanup fails.

Typing is **not** autosaved on each keystroke. Unsaved changes are labeled and are persisted by Save unfinished, Mark details reviewed, Back, Skip or Continue. Refreshing before any of those actions can lose unsaved typing; already saved entries/files recover. A file whose upload could not even establish its saved source must be retried or explicitly removed before leaving, so bytes are not silently discarded. Pending sources with saved metadata may continue as Needs review with accurate upload warnings.

## Proposed migration — 012_booking_collection.sql

Prepared and executed only in isolated PGlite fixtures; **do not paste this into the live SQL Editor yet**.

1. Formalizes the observed owner-private onboarding table for a clean environment; adds `updated_at` and immutable identity protection. Retains existing preference keys and owner-only access.
2. Adds `bookings.reservation_status`, default `unknown`, constrained to unknown/confirmed/pending/cancelled. Existing verification remains review status. Existing booking contents and required booking/trip dates are preserved.
3. Allows private attachment metadata to point to an intake UUID before a complete booking exists; adds immutable checksum and intake index. Preserves the private bucket and existing files/paths. Does not make normal booking fields nullable.
4. Extends the existing private-upload guard and insert policy to validate staged sources and later binding to their ordinary booking. Other owner-private read/update/delete policies and Storage helpers remain in place.
5. Adds owner-scoped save/progress/materialization RPCs with explicit anonymous/public execution revocation. Extends the existing `save_reviewed_booking` RPC for manual intake and separate reservation status, preserving validation, authorization and idempotence.
6. Never publishes a draft. Materialization requires an already finalized trip; it binds files and removes the staged entry atomically after successful normal-booking insertion. It never invents required fields.

Previously prepared migrations 001–011 were not changed. The new flow fails closed when the connected database lacks the draft/collection schema. The legacy Bookings screen remains available without the new collection panel. The temporary legacy trip creation route remains unchanged.

Known bounds: 20 staged entries per trip; existing preferences JSON limit 100,000 characters, per-entry SQL bound 25,000; existing 3 MB source limit; existing AI document reader limits (five PDF pages, 20 megapixel images). Unsupported/unreadable documents remain stored for manual review where upload succeeds. An incompatible pre-existing pending-bookings format is reported without overwriting it.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 316 tests passed in 73 files, including isolated database/RLS tests |
| `npm run test:e2e` | 64 desktop/mobile cases passed |
| Focused final booking browser run | 8 cases passed after final recovery/spacing changes |
| `npm run build` | Passed |

Coverage includes multiple upload/manual sources, grouped review, missing required fields, corrections, unknown versus confirmed reservation status, retained originals after extraction failure, retry without reupload, honest storage failure, cancel/remove, optional skip, Continue with unfinished entries, refresh/resume, independent drafts, sequential saves of edited cards, stale revisions, duplicate/lost-response retries, owner/member isolation, preserved existing bookings and transactional later materialization. The database migration is also replayed twice to check rerun compatibility. Storage policy access is checked using authenticated isolated roles.

Screenshots captured from the real components with simulated persistence and fictional test-only data:

- `test-results/booking-collection-collect-c3fea-ues-with-unfinished-entries-desktop/booking-collection.png`
- `test-results/booking-collection-collect-c3fea-ues-with-unfinished-entries-mobile/booking-collection.png`
- Each directory also contains `booking-collection-viewport.png`.

Checked desktop/mobile visually and horizontal overflow at 320, 375, 768 and 1440 pixels. Browser fixtures use actual components with injected mock transport; they do not certify real authenticated Supabase Storage/network integration. Unit/API tests simulate provider failure/success. **No paid extraction, authenticated live upload, live database mutation or real deletion was tested.** Full live acceptance remains blocked on the unapplied migrations and safe developer environment.

The sandbox initially prevented the browser server from binding and stalled the build workers. Both checks succeeded with authorized local process permissions; this was not an application/database failure.

## Files changed in Phase 7C

New application files:

- `lib/booking-collection.ts`, `lib/booking-collection-server.ts`
- `app/api/booking-collection/route.ts`
- `components/booking-collection.tsx`, `components/booking-collection-client.tsx`
- `components/pending-booking-collection.tsx`
- `components/booking-fields.tsx`, `components/essentials/fields.tsx`
- `supabase/migrations/012_booking_collection.sql`

Updated integration/shared files:

- `app/trips/new/page.tsx`, `app/api/booking-import/route.ts`, `app/create-trip.css`
- `components/essentials/forms.tsx`, `components/essentials/view.tsx`
- `lib/essentials.ts`, `lib/storage-cleanup.ts`
- `lib/trip-overview.ts`, `lib/during-trip.ts`: narrow semantic correction so “confirmed” counts/labels require explicit reservation status rather than reviewed details; approved layouts remain unchanged.
- `PRODUCT_SPEC.md`, `playwright.config.ts`

New tests:

- `tests/booking-collection.test.ts`, `tests/booking-collection-api.test.ts`
- `tests/booking-collection-database.test.ts`, `tests/pending-booking-collection.test.tsx`
- `tests/browser/booking-collection.spec.tsx`, `tests/fixtures/booking-collection-browser.tsx`
- This acceptance/handoff report.

Adjusted existing assertions/mocks: `tests/create-trip-route.test.tsx`, `tests/trip-overview.test.ts`, `tests/during-trip.test.ts`, `tests/trip-overview-view.test.tsx`, `tests/browser/during-trip-layout.spec.tsx`. They reflect the new loader and the distinction between reviewed details and confirmed reservations. Uncommitted work from earlier phases was preserved; generated `next-env.d.ts` was restored to its pre-phase content.

## Developer handoff — no live approval granted

1. Verify a genuinely restorable backup, including separate private Storage object recovery if needed. Database SQL dumps alone do not preserve file bytes. The reported paid-backup upgrade message does not establish recovery; no purchase was made or required by this implementation.
2. Create a separate development Supabase project/local stack. Keep credentials out of chat. Confirm it is not the project serving the live website before any authenticated fixture writes.
3. Review actual migration history/catalogs and the supplied connected inspection reports. Compare the existing extra onboarding table, owner policy/constraints and old onboarding RPCs; the prior zero-row report is a historical snapshot, not proof it is still unused. Preserve any newly accumulated legacy preferences. Confirm 005–009 guards/Storage helpers and grants match the expected baseline. Never replay the old combined upgrade over newer draft-aware helper functions.
4. Review 010, 011 and 012 together and test them in order in the separate environment. Do not rewrite already-applied migration history. 012 changes attachment linkage/path checks and replaces two existing function definitions and one upload insert policy; review their full live definitions for custom drift before approval.
5. Record baseline counts/fingerprints/relationships, then exercise real development Auth, PostgREST/RPC/schema-cache behavior, private Storage uploads/signed downloads/retry/deletion, cross-account denial, quota-limited consented extraction, two drafts and existing finalized trips. Use fixtures only. Confirm ordinary booking/attachment creation and current live-client compatibility.
6. If these checks and a restore rehearsal pass, arrange a separately approved live migration/release procedure with a quiet write window and post-change count/relationship/privacy verification. Current recommendation for live application remains **NO-GO pending that developer review and verified recovery**. No automatic schema changes or live rollback are performed here.

## Phase 7D boundary

Next implement the approved Travel Style & Review screen using the same draft ID and saved collection counts. Do not fabricate statistics or force an unrelated theme/onboarding wizard. The future finalization phase must preserve incomplete intake and original files; complete entries may use the prepared existing-booking materialization path only after proper finalization authorization. Do not mark unknown reservations confirmed or force unfinished entries into required-field booking rows. Finalization/publication is not part of Phase 7C.
