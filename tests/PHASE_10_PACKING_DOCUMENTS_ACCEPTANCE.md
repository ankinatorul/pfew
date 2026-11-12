# Phase 10 — Packing & Documents

Implemented locally on 12 November 2026. No live database/Storage writes, paid AI calls, migration application, deployment, push, merge or commit. All uncommitted Phase 9 work and the unrelated duplicate test file are preserved. Pre-phase source checkpoint: `/private/tmp/pfew-before-phase10/source/`.

## 1. Implemented

Existing `?view=packing` and `?view=documents` remain separate trip destinations. They use the existing full-width canvas, approved shell/navigation, Manrope, off-white background, Lime actions and compact Lavender-accented cards. No page-level rounded wrapper, large illustration or new asset library. Existing Home and dashboard layouts are unchanged.

**Packing — “Your packing list”**: existing named/traveler lists, one-field quick add, inline packed checkbox, compact item edit (name/category/quantity/notes), confirmed deletion, grouping, same-category ordering, optional hide-packed view, real row-count progress and an honest 0-of-0 empty state. Quantity defaults to 1; blank category becomes existing free-text Other. Existing categories remain valid; no second category model was added. Progress counts item rows, not individual units within a quantity.

Reuse a previous owned finalized trip's list or an existing private template. Only definitions are copied: title, category and quantity. Source completion/notes remain in the source; existing target matches are skipped. Template saving reuses the existing template action/table. Existing starter/AI suggestion review stays explicit; nothing is added on render or without approval.

**Documents — “Your documents”**: private document cards, search/category filters, independent PDF/JPEG/PNG upload, rename/category edit, authorized download, pending-upload recovery and confirmed deletion of independent uploads. Upload date/type/size and trip are real saved metadata. No passport/ID-number or expiration fields were invented. Booking confirmations reuse their original file records and paths, with a distinct label and booking context. Hide/restore affects only a Documents shortcut; it does not delete or duplicate the confirmation.

In-app reminder editors on both pages use existing preparation tasks. Users explicitly add/edit/complete/remove tasks and choose any due date. Files/packing checkboxes do not complete reminders, validate passports, infer visa eligibility or create deadlines. No email, push, SMS or scheduler was added.

## 2. Infrastructure reused

- Existing trip route/session/role checks, finalized-trip helper, RLS, app shell, feature heading/navigation and design tokens. Phase 9's shared header was extended for these two headings; its Bookings/Budget appearance is preserved.
- `packing_lists`, `packing_items`, `packing_templates`, `prep_tasks`; existing title normalization, reviewed additions, template saving and dashboard summary helpers.
- Existing `PackingSuggestions`, checklist/AI review, `/api/packing-suggestions`, provider/quota/consent and duplicate-aware reviewed additions. No provider/model/paid service was introduced or changed.
- Existing `booking_attachments`, private `booking-files` bucket, file size/type/name validation, authenticated RLS, Storage helper/policies, signed-download endpoint and personal upload management.
- Existing booking/intake upload guard is retained unchanged; its trigger now explicitly applies to booking-kind records. Existing booking source materialization, source checksums, file-delete guards and other-uploader protections remain active.

## 3. Files changed

New application files:

- `lib/packing-documents.ts`: types, validators, progress/grouping, reminder filtering and file labels.
- `app/packing-document-actions.ts`: structured validated packing/reminder operations with recovery errors and targeted revalidation.
- `components/packing-documents.tsx`, `components/packing-documents-client.tsx`: authorized server reads, capability checks, reuse composition and router integration.
- `components/packing-manager.tsx`, `components/document-manager.tsx`, `components/readiness-reminders.tsx`: lightweight presentation and inline editors.
- `app/api/trip-documents/route.ts`: independent-file reservation/upload verification/recovery and private metadata operations.
- `lib/private-document-removal.ts`: shared existing authorized Storage-before-metadata removal sequence.
- `app/packing-documents.css`: scoped layouts, focus/touch targets and mobile reminder wrapping.

Existing files updated:

- `app/trips/[id]/page.tsx`, `app/layout.tsx`, `app/shell.css`: routing/loading/style integration using the existing canvas architecture.
- `components/booking-manager.tsx`: reusable feature header supports Packing/Documents without changing Phase 9 headings.
- `lib/readiness.ts`, `components/readiness-suggestions.tsx`: optional deterministic saved-theme starters and a safe unknown-date/clothing-day display. Existing AI input/privacy behavior is preserved.
- `app/file-actions.ts`: existing delete action calls the shared removal helper.
- `lib/trip-deletion.ts`: deletion copy accurately includes independent private trip documents already handled by existing trip cleanup.
- `playwright.config.ts`: registers the isolated Phase 10 browser suite.

New verification files: migration 016, optional read-only Phase 10 report, `tests/packing-documents.test.ts`, `tests/packing-document-actions.test.ts`, `tests/packing-documents-reader.test.tsx`, `tests/packing-documents-database.test.ts`, `tests/trip-documents-api.test.ts`, browser suite/fixtures, this report and screenshot gallery. No dependency, environment-variable or existing migration changes. Build-generated `next-env.d.ts` references are restored after checks.

## 4. Prepared database changes — 016, not applied

`supabase/migrations/016_packing_and_documents.sql` extends existing models:

- Packing items: `notes` (bounded text), `position`, `packing_revision`. Lists: `packing_revision`. Preparation tasks: `readiness_revision`. Existing checked states, categories, quantities, task metadata and due dates are not rewritten.
- Attachments: `document_kind` (booking/trip, existing rows default booking), optional `display_name`, constrained `document_category`, `documents_hidden`, `document_revision`.
- Replaces only the known attachment path constraint to retain original booking/intake paths and allow a new independent path `uploader/trip/documents/file-uuid`, with no booking/intake link and a required checksum. Existing objects are not moved, renamed or copied.
- The existing booking upload validation function is **not replaced**. Its trigger is scoped to booking-kind rows. A separate narrow privileged trip-document guard validates authenticated uploader, finalized-trip editing permission, receipt in Storage and a 100-independent-document limit per uploader/trip. An all-document identity/revision guard prevents changing kind, owner, path, original filename/type/size/checksum to bypass validation.
- Replaces the existing attachment insert policy with its original owner/editor booking/intake branches plus the constrained independent-file branch. Read/update/delete remain uploader-private. Bucket, object policies, access helper and deletion guards are unchanged.
- Adds security-invoker RPCs `change_packing`, `change_preparation_reminder`, `save_document_metadata`, with explicit public/anonymous execution revocation and authenticated grants. New trigger functions also revoke public/anonymous execution. The privileged independent upload guard requires a trusted administrator owner and empty search path.

The base document workflow depends on the reviewed private-upload/intake infrastructure through 012 plus finalized-state helpers from 010. Phase 9's 015 is separately prepared; 016 does not use its finance columns or enable Phase 9 controls. Review pending 015/016 in the established migration order without replaying already-applied files. The presence of SQL files is not evidence of application.

Capability probes disable new packing/document/reminder controls when their columns are absent. Existing packing records and booking confirmations remain readable, including the older attachment schema without intake/document columns. Existing starter additions can still use their previously supported baseline path; new notes/order/copy/independent uploads require 016. Capability reads are not a substitute for administrator metadata/grant verification.

## 5. Packing persistence and authorization

New changes require authenticated editing access to the target finalized trip and run as the user under existing RLS. Per-trip advisory serialization, row locks and expected revisions protect item edits/toggles/removals/reordering. IDs are stable across retries; matching create retries and normalized-name duplicates preserve existing packed states. New and legacy updates increment revisions. Reordering checks the complete saved ID/revision set and changes only order. Confirmed list removal checks its current item snapshot.

Quick-add failures retain text and the same UUID. Checked controls respond immediately to explicit user input, revert on failed saves, and refresh from revisioned stored records. Progress totals use stored rows; a pending checkbox is not invented saved completion. Empty lists show zero progress, not 100%.

Copies require an owned finalized source trip or owned template, skip existing normalized names and never change the source or copy notes/packed states. Packed copies start false. New list/source identifiers cannot move items between trips. Existing shared editors can manage target lists, viewers/strangers cannot write, drafts are rejected, and completed-trip editing permissions are preserved. Operations use the existing data, not another local persistence model.

## 6. Storage and privacy

Files use the existing private bucket and authenticated `/api/attachments/{id}` route, which provides a 60-second signed download with private/no-store and no-referrer behavior. New client responses contain safe metadata, never Storage paths, checksums, uploader IDs or credentials. Current-account-only queries prevent another traveler's documents from appearing. Personal upload management remains available after leaving a shared trip, as before.

Uploads validate authentication, 3 MB maximum, PDF/JPEG/PNG MIME and magic bytes before reservation. UUID paths and sanitized original names are used. A stable ID/checksum reserves pending metadata, then uploads without overwrite. The server downloads/verifies size and SHA-256 before marking ready. A failed response is not evidence that bytes were absent: recovery checks the original reserved object. Metadata failures keep successfully stored originals; there is no automatic deletion on upload failure.

Pending rows offer Check saved upload or Retry original file. Reselecting different bytes for the same reserved ID is rejected. If bytes never reached Storage, the original must be reselected. Status text is used instead of an invented progress percentage. A permanently lost in-memory file selection cannot be recreated; saved metadata and any received bytes remain recoverable.

Rename/category edits affect metadata only and compare revisions. Independent deletion requires explicit confirmation and uploader access; Storage is removed before its metadata using the shared sequence. SQL and Storage cannot form one transaction: a failure after explicit removal may leave stale metadata after bytes were removed, with an accurate retry message. No true rollback is claimed. Users can still manage their own private files under the existing owner-private rules; trip viewers cannot upload new files, but an uploader may manage their own previously uploaded private file.

## 7. Booking confirmations

Booking and independent files share the existing attachment table but have distinct kinds. Booking confirmations are shown once using existing rows and authorized links. Booking/intake IDs, original filename, path, checksum and Storage bytes are preserved. A pending intake source stays labelled as such until the existing reviewed-booking workflow binds it.

Documents offers hide/restore for a booking shortcut, not physical deletion. Even a forged Documents delete request for a booking-kind file is rejected before Storage removal. Actual booking-file removal remains in existing Bookings/account tools with their existing confirmation/authorization. Hiding does not change provider reservation status, bookings, itinerary links or file availability. Dashboard file counts continue to count real stored files, including hidden shortcuts; the Show hidden shortcuts control exposes that distinction.

## 8. Dashboards, starters and in-app reminders

Packing counts and document pending/ready counts come from the same tables already read by Home and trip dashboards. No new completion counters are persisted. Actions revalidate Home and the affected trip; dashboard URLs already select that trip's Packing/Documents routes. A regression test compares progress with the existing dashboard model. No dashboard layout was redesigned.

Reminders are existing `prep_tasks`, not a new notification system. The UI displays relevant saved packing/document tasks; title/date/done changes are explicit, duplicate names are prevented for the new operations, old task categories and source links remain intact, and due dates are user-supplied. Uploads never validate a passport/visa or mark a task done. No expiration, entry eligibility or deadline is inferred. No email/push/SMS integration or scheduling dependency was introduced.

The deterministic checklist now optionally uses the saved Tropical/Ski/Mountain/City Break theme for a small, clearly labelled idea. Themes do not establish real weather or activity requirements. The existing review allows adjustments before adding, filtering existing item names and preserving completion. The existing live provider remains opt-in/consented and uses its existing context/privacy contract; it does not gain verified weather/theme/location knowledge or a new service in this phase. No paid request occurs on render and none was made during QA.

## 9. Tests and build

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **396 tests in 92 files passed**.
- `npm run test:e2e`: **100 desktop/mobile cases passed**. The final eight Phase 10 cases were rerun after the mobile wrapping, failed-checkbox rollback and independent form-state refinements.
- `npm run build`: passed.

Six new isolated PGlite cases exercise actual 016 SQL with existing roles/RLS/functions: CRUD, quantity/completion/order, retries and stale updates, duplicate protection, owner-only source copies, viewer/stranger/draft denial, multi-trip isolation, completed-trip access, independent private Storage access, booking shortcut preservation, explicit reminders and anonymous RPC denial. The read-only before/after report confirms original business fingerprints and booking paths/Storage rows stay unchanged; the original booking-upload function's body hash remains identical. Migration replay is tested.

API tests use authenticated mock storage/metadata and actual route validation to cover MIME/signature/size rejection, immutable retries, original retention after metadata failure, safe response projection, shortcut hide without deletion, stale deletion and explicit own-file removal. Existing authorized-download and collaboration/private-file suites remain passing.

Browser tests bundle real components with isolated simulated transport/storage, not live Supabase writes. They cover quick add/edit/delete/quantity/check/refresh, duplicate avoidance, reviewed deterministic suggestions, owned-list copy, explicit reminders, private file links, upload/rename/delete cancellation, hide/restore, pending upload recovery, empty/viewer/missing-schema states and 320/375/768/1440px layout checks. Actual Storage/Auth network behavior and paid-provider output are not certified by these mocks. No real trip, account, booking or private file was modified or deleted.

## 10. Screenshots

Ten captures: desktop/mobile packing overview, item edit, reviewed starter suggestions, documents overview and independent upload. See [the gallery](screenshots/phase10/README.md). Fictional fixtures only; no moodboard trip data, photos, decorative illustrations or Phase 11C assets. Full-page mobile captures include the existing fixed navigation at its viewport capture position.

## 11. Limitations

- 016 is unapplied. New metadata/revision-aware writes remain gated; existing supported reads/downloads remain available. The separate unapplied Phase 9 finance dependency is unchanged.
- Existing private-file entitlement rules are preserved: independent uploads require editor access; files remain private to the uploader rather than shared automatically with trip members.
- No expiry metadata/verification engine. Passport validity and insurance/visa requirements remain user checks, optionally tracked through reminders/research.
- The existing live packing provider's context is unchanged. Theme personalization is deterministic starter context only; no reliable weather claim is made.
- Ordering and list-removal snapshots accept up to 1,000 items. Existing template saving retains its baseline form/error behavior. New-operation serialization cannot make every legacy external action or Storage+SQL operation atomic.
- Files retain the existing 3 MB limit; 100 independent documents per uploader/trip. No private notes or file bytes are copied between trips. A local unsent file selection must be reselected after refresh if no bytes reached storage.
- No live automated write checks, migrations, backup verification, deployment or external messaging occurred.

## 12. Developer handoff

1. Review `supabase/migrations/016_packing_and_documents.sql` and current live prerequisite definitions. Verify especially the scoped original booking trigger, immutable kind/path guard, independent-file insert branch, original owner-only read/update/delete rules, and the private bucket/Storage helper. Do not silently override custom live policies or replay earlier migrations.
2. Confirm the intended shared project and an appropriate restorable recovery option before separately approving schema changes. A source snapshot or aggregate fingerprint is not a database backup; private Storage bytes need their existing recovery plan. No new hosted test project or paid upgrade is mandated here.
3. Optional: paste all of `supabase/VERIFY_PHASE10_READ_ONLY.sql` into a fresh SQL Editor query. It returns one private `phase10_report` and makes no writes or application RPC calls. It works before/after 016. Save a baseline during a quiet write window.
4. Expected new metadata: ten columns; seven new functions plus the unchanged original upload guard; enabled document/packing/preparation triggers; the new path constraint; and exactly the reviewed insert-policy extension. The bucket must remain private with the existing type/size limits. Original business fingerprints/counts and original booking-upload body hash should match after a separately approved application, accounting for legitimate intervening writes.
5. Only after explicit approval, apply through the established migration transaction/history process in the reviewed order. This work has not applied 015 or 016. The new privileged Storage-validation guard must have trusted administrator ownership and empty search path; application RPCs remain invoker and deny anonymous execution. Preserve all existing RLS and Storage checks.
6. Re-run the read-only report before using new writes. Any later manual Storage/Auth smoke check requires owner-approved isolated records and authorization: verify reserve/upload/recover/download, private access from another account, kind immutability, hide/restore, explicit independent removal, checked state persistence, copies and reminders. Do not delete real trips/bookings/files for testing.

Prepared body MD5s (`pg_proc.prosrc`; comparison aid, not a substitute for source/security review):

| Function                                                      | Hash                               |
| ------------------------------------------------------------- | ---------------------------------- |
| `document_identity_guard()`                                   | `80cfad97100015878fc6b30f5d670321` |
| `validate_trip_document()`                                    | `327e25fa571515b7938c2025a049d981` |
| `save_document_metadata(uuid,uuid,integer,text,text,boolean)` | `c440246149bbce41c6c3f6487301fb23` |
| `packing_revision_guard()`                                    | `764cb25ee7e9b18ec96dcc9b0c3b0c0a` |
| `preparation_revision_guard()`                                | `39da1d0e7f113bc14075e8ada16c7132` |
| `change_packing(uuid,jsonb)`                                  | `91fc1116d501e868d5dfd1bd67a277b4` |
| `change_preparation_reminder(uuid,jsonb,boolean)`             | `6cd619c030054fea829947d54f9ce2d8` |

## 13. Recommended next phase

Review Phase 10 and the prepared database dependency. After separately approved schema/application checks, proceed only with the next explicit product brief. Phase 11C asset integration was not started; no unrelated screen, notification system or redesign was added.
