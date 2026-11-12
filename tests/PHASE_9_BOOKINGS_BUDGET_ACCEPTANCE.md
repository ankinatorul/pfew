# Phase 9 — Bookings & Budget

Implemented locally on 12 November 2026 in the existing Next.js/Supabase project. No live database writes, paid extraction, migration application, deployment, push, merge or commit. Pre-phase source checkpoint: `/private/tmp/pfew-before-phase9/source/`. The unrelated untracked `tests/shell-data.test 2.ts` is preserved. The owner's choice to use one Supabase project is respected; a separate hosted database is not required by this implementation.

## 1. Delivered behavior

Existing destinations remain separate: `/trips/[id]?view=bookings` and `?view=budget`. They now enter the same approved full-width app canvas as Home, trip dashboards and Itinerary, before the legacy wrapper. Off-white canvas, existing Manrope, Cobalt sidebar, Lime actions, Lavender accents, rounded individual cards and shared 24–32px desktop gutters are preserved. No page-level rounded card or restrictive max-width was added. Existing screens and routes remain available.

**Bookings:** “Your bookings” / “All your reservations, in one happy place.” Summary, grouped saved bookings, title/provider/reference search, category/review/reservation filters, manual creation/editing, details, original confirmation links and confirmed removal. Original category IDs remain flight/accommodation/ground transport/ferry/car rental/activity/other, with human-readable list headings. No restaurant or second category schema was invented; those records can use existing Other.

Manual forms require known booking dates rather than pre-filling a trip date as a reservation date. Existing fields and automatic geographic/time-zone normalization are reused. Review and reservation values stay independent. The new form labels “Reviewed” / “Needs review” map to existing `user confirmed` / `unverified` verification values; changing verification does not confirm a reservation. Cancellation preserves the row and its history. Booking prices distinguish unreviewed values from reviewed values and confirmed reservation context, without treating either as paid expenses.

The owner can open **Upload confirmation / review**, including when there are no saved intake entries. This embeds the real Phase 7C grouped collection with multiple PDF/JPEG/PNG uploads, original-file retention, explicit consented extraction, labeled-text reading, manual corrections, unfinished saving, retry and later materialization into the existing booking table. No new extraction provider, parser, upload route or collection store was introduced. Editors can manage ordinary bookings; the existing staged collection remains owner-private.

**Budget:** “Your budget” / “More adventures, fewer money surprises.” Overall monetary target/currency, expense-only actual and remaining amounts, progress, spending by category, separate booking-price/paid references, other-currency totals and recorded expenses. Set/edit/clear the target; create/edit/confirm-delete named expenses; filter by category/currency; show notes/details and optional booking association. The date remains required because the existing expense table requires it. No default monetary target is invented; zero and unset budgets remain distinct. Travel style is not edited by these monetary controls.

## 2. Existing infrastructure reused

- Existing app route, shell, tokens, `tripSectionUrl`, authorized session, `tripRole`, owner/editor/viewer model, audit and RLS helpers.
- Existing `bookings`, `expenses`, `budget_allocations`, `budget_settings`, booking/segment relationship and trip budget/currency columns. No second booking, expense or trip state table.
- Existing `BookingFields`, `Fields`, `bookingSchema`, geographic search/normalization and stored location IDs. Optional management labels leave approved Create Trip behavior intact.
- Existing `BookingCollectionClient`/`BookingCollection`, owner-private collection loader, `/api/booking-collection`, `/api/booking-import`, consent/quota handling, stable IDs, source checksums and materialization.
- Existing private `booking-files` bucket, upload/remove forms, `/api/attachments/[id]`, 60-second authorized signed download, `has_other_private_files` and Storage cleanup. No bucket, key or storage policy changes.
- Phase 8 continues to read the same booking rows; successful mutations revalidate the trip and Home. No extra itinerary records are generated.
- Existing advanced allocation tools (`BudgetBreakdown`, `BudgetDistribution`, `AllocationForm`, rules and removal actions). They are discoverable under **Advanced planning & saved allocations**, with planned/unallocated figures clearly separated from actual-expense remaining budget.

## 3. Files changed

New application files:

- `lib/booking-budget.ts` — types, validation, integer-cent currency/category totals, legacy expense labels and truthful booking-price labels.
- `lib/booking-removal.ts` — shared existing authorization/private-file cleanup preparation, reused by the legacy and new booking deletion actions.
- `app/booking-budget-actions.ts` — recoverable validated booking/expense/target mutations, stable IDs, expected revisions, targeted refreshes.
- `components/booking-budget.tsx` — server reads, private metadata batching, capability probes, owner collection and existing file/planning composition.
- `components/booking-budget-client.tsx` — router refresh and existing server-action integration.
- `components/booking-manager.tsx`, `components/budget-manager.tsx` — presentation/forms and shared feature heading/navigation.
- `components/budget-planning-tools.tsx` — composition of existing advanced allocation functionality.
- `app/booking-budget.css` — scoped responsive styling for the two feature pages.

Existing files updated:

- `app/trips/[id]/page.tsx`, `app/layout.tsx`, `app/shell.css` — scoped routing/loading, stylesheet import and existing full-width selector.
- `app/essentials-actions.ts` — calls the shared existing booking-removal preparation; other feature actions retain behavior.
- `components/booking-fields.tsx`, `components/essentials/fields.tsx` — opt-in management status labels, optional status control for new bookings, stable accessible select names.
- `lib/booking-collection-server.ts` — setup copy no longer instructs the owner to create a separate development database. Behavior remains fail-closed.
- `playwright.config.ts` — includes the Phase 9 browser suite.

New migration/checks/tests:

- `supabase/migrations/015_bookings_and_budget.sql`, `supabase/VERIFY_PHASE9_READ_ONLY.sql`.
- `tests/booking-budget.test.ts`, `tests/booking-budget-actions.test.ts`, `tests/booking-budget-reader.test.tsx`, `tests/booking-budget-database.test.ts`, `tests/booking-confirmation-access.test.ts`.
- `tests/fixtures/booking-budget-browser.tsx`, `tests/browser/booking-budget.spec.tsx`, this report and the screenshot gallery.

No dependencies, environment variables, credentials, existing applied migration files or approved dashboard components were changed. Build-generated `next-env.d.ts` is restored to its pre-phase references after checks.

## 4. Prepared migration 015 — not applied

The owner's earlier administrator exports confirmed 010–014 at the time they were shared. This phase makes no new live schema-verification claim. Runtime zero-row probes check the required booking/expense columns; unavailable new schema disables new controls while preserving read access. A column probe is not a full catalog/grants audit.

015 is additive and was executed only against isolated fixtures with the existing migrations:

1. Adds `bookings.finance_revision`, nonnegative integer default 0.
2. Adds nullable `expenses.title` (bounded text), nullable `expenses.booking_id` (existing-booking FK, `ON DELETE SET NULL`) and `expenses.finance_revision`, default 0. Existing unnamed expenses remain unchanged and display an explicit legacy label. Editing them through the new form requires the user to supply a name. Existing expense dates remain NOT NULL.
3. Adds the partial `expense_booking` index and two `finance_revision` triggers sharing `finance_record_guard()`. Identity stays immutable, a real update increments revision, and expense/booking associations must refer to the same trip. Legacy actions also increment revisions when they change these rows.
4. Adds `save_managed_booking(uuid,uuid,integer,jsonb)` and `change_expense(uuid,uuid,integer,jsonb,boolean)` as **security invoker** functions. They require authenticated trip editing access and a finalized trip; RLS remains active. Stable-ID create retries are idempotent. Existing rows are locked and checked against expected revisions before changes. Two-decimal inputs are checked before PostgreSQL could silently round them.
5. Adds `save_monetary_budget(uuid,numeric,text,numeric,text)`, a narrow **security definer** boundary matching the existing `set_trip_budget` editor permission scope. It locks the authenticated user's authorized finalized trip, compares the old monetary target and currency, validates the new target, then writes only budget and currency. Travel style, expenses, bookings and allocations are not modified. Empty search path and trusted administrator ownership are required.
6. Explicitly revokes public/anonymous function execution and grants the three application RPCs to authenticated users. No RLS policy is broadened or disabled.

No existing business rows are backfilled, reclassified, converted, deleted or renamed. The before/after isolated read-only report verifies existing trip/booking/expense counts and original-field fingerprints match. 010–014 are untouched; do not replay them just to install this phase.

## 5. Persistence, authorization and errors

Manual bookings/expenses keep stable IDs across retries. Revise/update/delete operations carry the saved revision; stale input is rejected. A completed identical create retry keeps one row; a retry after a changed row returns a conflict. Budget editing captures the original target/currency when the form opens, so an unrelated later refresh cannot silently replace its concurrency expectation. Server actions return friendly errors instead of redirecting away from unsaved editors. Pending submits are guarded and controls are disabled; entered fields remain on failure.

Owner/editor access is checked in RPCs and existing RLS, with viewer/stranger denial tested. Drafts cannot use finalized financial operations. No caller-supplied owner value is trusted. Booking removals reuse existing editing permission, other-owner-private-file protection and file cleanup before the booking deletion; the final row delete compares its revision. Other travelers' files must be removed by their owners first. The confirmation explains that removing a booking removes its current-account private confirmations but preserves itinerary activities and recorded expenses.

Storage cleanup and SQL deletion cannot be one atomic transaction. If a concurrent change or failure occurs after explicit removal began, some own files may already have been removed while the booking remains. The error says so and asks the user to reload/retry; no false rollback or success is claimed. This is inherited storage architecture, not a background destructive process. Extraction failures do not call this deletion path and retain successfully stored originals.

Private confirmation metadata is read once per page under existing RLS, not once per card. Client props contain authorized metadata and `/api/attachments/{id}` links, never Storage object paths, signed URL caches or service-role credentials. The existing endpoint verifies authenticated Google user access, reads metadata through RLS, and issues a 60-second download with `private, no-store` and `no-referrer`. Anonymous/hidden/pending file responses are tested. Current-account file counts do not claim to include other travelers' private files.

A failed financial read produces an unavailable state rather than a credible-looking zero total. Runtime missing-schema probes disable new edits. The preserved advanced baseline allocation tools and existing collection/file operations retain their original database dependencies and error handling.

## 6. Itinerary integration

The same `bookings.segment_id` is used in the shared booking fields and stored booking update. No itinerary item is inserted merely because a booking is added, reviewed, edited or cancelled. Phase 8 re-reads updated saved booking dates/times/status through its existing query and folds linked booking details into one activity card. Its existing date-difference warnings remain available.

The saved activity's own dates/times are not silently rewritten to match a changed booking. The current booking details are displayed alongside that separate saved plan; intentional mismatches can be reviewed. Removing only the itinerary association remains Phase 8's existing unlink operation, which preserves the booking. Removing a booking preserves its linked itinerary activity; the new expense FK clears only the expense's booking association, retaining amount, currency, name and notes.

## 7. Budget calculations and double counting

- **Actual spending** = sum of manually recorded `expenses.amount`, grouped by original currency.
- **Remaining budget** = trip monetary target minus recorded expenses in the target's currency. A negative result is labelled **Over budget** and shown as the exceeded amount. Unset remains unset; zero remains a real zero target.
- **Planned costs** = existing allocations, separately totalled by their saved currency.
- **Saved booking prices** = non-cancelled booking price references, grouped by currency. Cancelled history remains visible in Bookings.
- **Amounts noted as paid on bookings** = separate references, never added to actual spending or deducted again from remaining budget.

Money-table calculations use integer cents, matching the existing `numeric(12,2)` schema. Legacy trip targets with extra precision remain stored unchanged; subtraction handles their saved decimal precision and presentation remains currency formatted. New targets/amounts use the existing two-decimal workflow. No floating-point per-row accumulation or exchange-rate multiplication is used.

Expense links are references, not extra charges. Multiple explicitly entered partial-payment expenses can link to one booking; the form shows the count already linked. No action automatically creates or duplicates an expense from a price or `paid_amount`. Existing unlinked expenses cannot reliably be matched by name, amount or date, so the application does not invent such links or auto-deduplicate unrelated payments.

The existing booking schema has no formal “estimated price” flag. Unreviewed prices are labelled as needing original-source verification; reviewed prices show reservation context. Neither a reviewed price nor a confirmed reservation proves payment. Estimates stay in the existing allocation low/high fields; no unsupported booking-price classification is asserted.

Advanced allocation distribution retains its prior include-prepaid rule. That affects only planning/unallocated target figures in the labelled advanced section, not the new actual-expense remaining figure. Its original forms and validation are retained.

## 8. Multi-currency behavior

Every booking, expense and allocation retains its original amount and currency. Original currencies are never summed into one scalar. Category bars and remaining target use the current trip currency only; other expense currencies are separately totalled and explicitly excluded from that target. All totals use actual saved records, with no invented FX rates, conversion service or bank integration.

Changing the target currency is an explicit user action, with copy explaining that this changes the target's unit but does not convert or rewrite existing amounts. Currency format validation follows the existing three-letter uppercase model; no new paid currency lookup or rate freshness claim is introduced. An expense's booking can have a different currency without any invented conversion.

## 9. Verification

- `npm run lint` — passed, zero warnings.
- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — **376 tests in 87 files passed**, including existing upload, collaboration, budget, storage-policy and itinerary regressions. A final focused money-model rerun includes the linked-itinerary read assertion.
- `npm run test:e2e` — **92 desktop/mobile cases passed**. After the final direct confirmation-link/price-context refinement, the **10 Phase 9 cases passed again**.
- `npm run build` — passed.

Four new database cases execute the actual 015 SQL in isolated PGlite roles/schema, including replay compatibility, business-field preservation, independent statuses, correct trip links, optimistic revisions, stable retry IDs, editor versus viewer/stranger access, booking-deletion expense retention and anonymous RPC denial. Existing database suites cover source privacy, staged uploads/materialization, shared private-file guards and row-level access.

New server tests cover missing schema, validation, normalization, no travel-style writes, no extra expense insertion, denied/stale removal without file cleanup, over-precise booking amount rejection and recoverable errors. Confirmation endpoint tests cover unauthenticated/hidden/pending denial and short-lived private authorized redirects.

Browser tests use the actual components in the approved shell with isolated simulated persistence/transport. They cover manual booking create/edit/remove/cancel/refresh, independent statuses, filters, details/authorized file route, target edit, named expense CRUD/linking, expense-only remaining and mixed currencies, input retention after failure, viewer/missing-schema gates, multi-file upload and preserved originals after failed extraction. Layouts are checked at 320/375/768/1440 widths with keyboard focus and screen-reader-labelled forms. The wider existing suite covers consent, retries, creation, mobile navigation and reduced motion.

No live Auth/Storage writes, real trip/booking/expense deletions, paid provider calls or production end-to-end writes were performed. Mocked browser/provider checks do not certify live credentials, network reliability or custom live policies.

## 10. Screenshots

Ten captures are saved under `tests/screenshots/phase9/`: desktop and mobile each have Bookings overview, booking details, grouped booking review/extraction recovery, Budget overview and expense creation. See [the gallery](screenshots/phase9/README.md).

They use fictional fixture records, not the moodboard's fictional trip contents, photos or decorative illustrations. The approved sidebar and full-width page architecture are preserved. Mobile full-page images show existing fixed navigation at its captured viewport position. Shared fields retain all real inputs, even where that makes a review card taller than a static moodboard.

## 11. Known limitations

- Migration 015 is prepared but unapplied. Its new manual booking editor, monetary target editor, named expense operations and reliable booking links remain disabled until the reviewed schema is installed. Existing saved records and existing collection/attachment/planning functionality remain accessible subject to their own previously reviewed dependencies.
- Owner-private intake continues to be owner-only. Other trip editors manage normal bookings, not someone else's unfinished private source collection.
- Expense dates remain required. Legacy unnamed expenses need a user-entered name when edited. No old notes or categories are repurposed as invented names.
- No FX, bank feed, refund inference or automated price-to-expense posting. Paid references and unlinked old expenses are intentionally not guessed into a reconciliation relationship.
- No new atomic file-plus-database deletion protocol; explicit removal can require recovery after partial own-file cleanup, as accurately disclosed above.
- Advanced allocation forms retain their existing validation/redirect behavior. This phase does not rewrite unrelated allocation, packing, source upload or AI extraction engines.
- Live provider and authenticated storage round trips were not write-tested. Baseline schema/grants must be verified in the intended project before any separately approved 015 application. Prior exports are historical evidence, not proof of current state.

## 12. Developer handoff — no automatic live changes

1. Review `supabase/migrations/015_bookings_and_budget.sql` with the existing 001–014 definitions, authorization helpers, booking-file delete guards and any custom live changes. Do not rewrite or replay already-applied migrations. `IF NOT EXISTS` cannot repair incompatible pre-existing columns/indexes.
2. Confirm the intended shared project and the owner's appropriate backup/recovery procedure before authorizing a schema change. Aggregate counts, screenshots and source archives are not a restorable database backup; private Storage bytes require their existing recovery approach separately. No purchase or new hosted project is required by this handoff.
3. Optionally paste all of `supabase/VERIFY_PHASE9_READ_ONLY.sql` into one new SQL Editor query. It performs only read-only metadata/aggregate inspection and returns one `phase9_report`. Save it privately. It works before and after 015; missing new objects before application are expected.
4. Review four new columns, constrained nullable legacy name/link fields, the expense-booking FK with SET NULL, enabled finance triggers, valid partial index, current RLS policies and existing anonymous restrictions. Confirm current 010–014 prerequisites using the project's actual history/catalogs, not local filenames.
5. Apply 015 only after explicit approval through the established transaction/migration process, in an appropriate quiet write window. This implementation has not applied it. Record its version through the project's migration-history process.
6. Re-run the read-only report. In a quiet window, original trip/booking/expense fingerprints/counts should match; investigate intervening legitimate writes rather than assuming every difference is corruption. Confirm all four functions match the reviewed source, anonymous execution is false, and the budget wrapper has trusted administrator ownership, security definer and empty search path. The two record-mutating RPCs must remain security invoker. Existing RLS must stay enabled.
7. Confirm localhost enables new controls after its capability reads succeed. Any later manual write smoke check must use owner-approved isolated fixture records and explicit authorization; do not delete real trips, bookings or files for QA. Verify save/refresh/stale edit, independent statuses, shared-role denial, private confirmations, expense links and separate-currency remaining values.

Expected prepared function body MD5s (`pg_proc.prosrc`, a comparison aid rather than a substitute for source/security review):

| Function                                               | Body hash                          |
| ------------------------------------------------------ | ---------------------------------- |
| `finance_record_guard()`                               | `2d29e1450ecef62a594109834c838ea8` |
| `save_managed_booking(uuid,uuid,integer,jsonb)`        | `5363cea2e26800e639f356e1f21aa551` |
| `change_expense(uuid,uuid,integer,jsonb,boolean)`      | `72c265b4c4868625ed840c3e4cefcb94` |
| `save_monetary_budget(uuid,numeric,text,numeric,text)` | `2c2fcf3ff06cb111a3c1afed3a69f943` |

## 13. Recommended next phase

Review these two screens and the 015 dependency first. After separately approved database/application smoke checks, choose the next feature phase explicitly; Packing/Documents refinement could reuse the existing infrastructure but was not started here. No Phase 10, deployment, push or merge was performed.
