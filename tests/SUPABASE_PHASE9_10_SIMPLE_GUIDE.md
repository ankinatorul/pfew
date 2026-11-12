# Supabase updates 015 and 016 — simple guide

These steps use your existing Supabase project. No second hosted database is required. This guide does not apply anything automatically.

## What the two updates do

| File | Purpose |
| --- | --- |
| [015_bookings_and_budget.sql](../supabase/migrations/015_bookings_and_budget.sql) | Enables the new booking editor, monetary budget controls, named expenses, optional expense-to-booking links and protection against conflicting saves. |
| [016_packing_and_documents.sql](../supabase/migrations/016_packing_and_documents.sql) | Enables packing management, document metadata and independent private uploads, and explicit in-app preparation reminders. Extends the existing private-file infrastructure. |

Both were tested against isolated local fixtures. Their compatibility with the current live project's custom objects still needs the checks below. They do not deploy the redesigned website. Existing migrations 001–014 must not be replayed just to install these updates.

## First: collect the checks (read-only)

1. Open your existing project at Supabase → **SQL Editor**. Check the project name is the one used by Pfew.
2. In VS Code, open [VERIFY_PHASE7_READ_ONLY.sql](../supabase/VERIFY_PHASE7_READ_ONLY.sql). Select the **whole file** and copy it. In a **new** Supabase SQL Editor query, paste it, make sure no text is selected, and click **Run**. Export/download the result as JSON or CSV; name it `phase7-before`. The comments at the bottom do not need to be run separately yet.
3. Repeat in a fresh query with [VERIFY_PHASE8_READ_ONLY.sql](../supabase/VERIFY_PHASE8_READ_ONLY.sql). Save the result as `phase8-before`.
4. Repeat with [VERIFY_PHASE9_READ_ONLY.sql](../supabase/VERIFY_PHASE9_READ_ONLY.sql). Save as `phase9-before`.
5. Repeat with [VERIFY_PHASE10_READ_ONLY.sql](../supabase/VERIFY_PHASE10_READ_ONLY.sql). Save as `phase10-before`.
6. Share these four reports privately in this conversation for review. They contain schema/security settings, counts and fingerprints rather than personal trip/file rows. Do not publish them or include passwords, keys, backup contents or private files. If a query fails, share the error text and stop that step; do not change policies or tables to make it pass.

Each script produces **one report cell** even though the text is long. Export the result rather than copying only the visible portion. `present: false` for a new Phase 9/10 field before migration can be expected; it is not itself a reason to rerun older migrations. If objects are partially present, review them before deciding what to run.

**Pause before applying updates:** the reports allow us to confirm prerequisites, identify already-applied updates, check private Storage/RLS/function permissions, and compare the existing upload guard. This guide is not a fresh live-schema GO recommendation.

## Before changing the live database

7. Confirm a current database backup or recovery option exists and that you know how it can be restored. Also confirm recovery for private Storage files; a database schema report, source-code copy or aggregate fingerprint is not a backup of file bytes. If recovery has not been verified, stop here and arrange it before applying updates. Do not share backup credentials or contents in chat.
8. After the reports have been reviewed and the missing migrations identified, choose a quiet period. Avoid editing trips, bookings, expenses, packing lists or documents during the before/after checks. Other live users' changes can alter counts/fingerprints. Keep the saved baseline reports.

## Apply only the missing, reviewed updates

9. If review confirms **015 is missing and ready**, open [015_bookings_and_budget.sql](../supabase/migrations/015_bookings_and_budget.sql) in VS Code. Copy the **entire file**, including `begin;` and `commit;`, into a **new** Supabase SQL Editor query. Do not add other migrations. Click **Run** once. A successful result may say there are no rows to return; this is normal for a migration.
10. If there is any error, **do not run 016**. Save the exact error and ask for review. Both files use transactions, but do not assume success or retry blindly. If SQL Editor reports an aborted transaction, run `rollback;` alone in that query to end it, then stop. Do not invent rollback SQL that drops columns/functions or replay earlier migrations.
11. After 015 succeeds, rerun **VERIFY_PHASE9_READ_ONLY.sql**, export as `phase9-after`, and have it checked against `phase9-before` before continuing. If 015 was already applied, verify its definitions instead of reapplying it.
12. If review confirms **016 is missing and ready**, repeat step 9 using [016_packing_and_documents.sql](../supabase/migrations/016_packing_and_documents.sql). Run it separately, once. On any error, follow step 10 and stop.
13. Rerun **VERIFY_PHASE10_READ_ONLY.sql**, export as `phase10-after`, and share it privately for comparison with `phase10-before`.

Do not change API keys, make a bucket public, disable RLS, or manually update existing records. If your project uses a migration-history process, keep it consistent; do not insert migration-ledger entries or use a broad CLI push without reviewing all pending files.

## What must be verified afterwards

14. The Phase 9 report should show all four expected columns and four functions present, the `expense_booking` index valid/ready, enabled finance triggers, RLS retained, correct grants and the reviewed function definitions/hashes.
15. The Phase 10 report should show all ten expected columns, seven new functions plus the original upload guard, enabled packing/preparation/document triggers, the reviewed path constraint and insert policy, and a **private** `booking-files` bucket. The original booking-upload function body must remain unchanged. Application RPCs must deny anonymous execution; privileged functions need trusted administrator ownership and the reviewed empty search path.
16. Compare before/after record counts and `original_fields_fingerprint` values for each report. Without intervening user writes, original business values should match. A mismatch requires investigation, not automatic restoration or deletion. The Phase 7/8 reports also need to confirm the prerequisite schema, permissions and original upload guard are compatible.
17. Refresh your local Pfew app. After schema review passes, manually test with clearly named records you create for this purpose: packing add/check/refresh, a harmless PDF or image upload/open/rename, booking shortcut hide/restore, and a test expense/budget. Check an existing trip still loads. Do not delete real trips/bookings/files. These manual checks write to your live project, so use only your own deliberate test records and an account you control. Cross-account privacy checks need a second authorized account; never disable RLS to test them.

No deployment is included. Applying schema updates will not publish the local Phase 9/10 interface to the live website. Stop after verification and review before any deployment.
