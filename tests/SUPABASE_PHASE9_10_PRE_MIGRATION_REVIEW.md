# Supabase 015–016: review of owner-provided exports

Reviewed four CSV exports supplied by the owner on 12 November 2026. No live query, write, migration, grant change or destructive test was executed by this review. Exports were parsed locally; private reports are not copied into the repository.

## Findings

- `Untitled query.csv`: Phase 7. All nine expected columns and eight RPCs present. All eight RPC body hashes match the latest corresponding local migration definitions; anonymous execution denied, authenticated execution allowed, empty search paths, expected trusted owner/security modes. All 25 reported public tables have RLS enabled. Three trips, zero invalid trip date ranges, zero bookings/attachments, zero broken booking links.
- `Untitled query (1).csv`: Phase 8. Six expected columns/four functions present; all four function body hashes match migration 014, expected grants/security modes, RLS enabled, enabled itinerary guard and valid/ready request index. Four itinerary segments, zero suggestions/bookings, zero broken booking links.
- `Untitled query (2).csv`: Phase 9. All four new columns, four functions and expense-booking index absent. No partial 015 installation detected in these objects. Existing reported finance policies/triggers/constraints match the expected shared-trip baseline; constraints are validated. Three trips, zero bookings/expenses.
- `Untitled query (3).csv`: Phase 10. All ten new columns and seven new functions absent. No partial 016 installation detected in these objects. The original `validate_private_upload()` body hash is `7e0af67691ce65594f0f6764b6ffca3d`, matching migration 012. Existing document path constraint, owner-private metadata policies, booking Storage policies and enabled triggers are compatible with the intended 016 extension. The existing bucket is private, allows PDF/JPEG/PNG, and limits files to 3,145,728 bytes. Zero attachment/packing-list/packing-item/preparation-task rows at export time.

Original-field fingerprints are the pre-application baseline only; preservation after migration cannot yet be certified. These snapshots cover the expected objects, not every possible dependency or unexported custom routine. Earlier read-only helper/source inspections are historical; these limited reports do not independently reverify every helper body or every Storage policy.

## Outstanding issues

1. **Recovery is unverified.** These exports do not establish a restorable database backup or private-file recovery. The owner previously reported the Backups page asking for an upgrade. This does not establish that an upgrade is required, or that a manual backup exists. Confirm the actual recovery arrangement before live schema changes.
2. **Previously identified excess privileges remain.** The fresh Phase 7 report still shows effective TRUNCATE for `anon` and `authenticated` on all 25 reported public tables (50 combinations). This predates 015/016; those migrations do not fix it. The app does not need TRUNCATE. PostgreSQL row policies do not constrain whole-table TRUNCATE. This is a database permission finding, not evidence of an exposed HTTP wipe endpoint. Prepare/review a narrow permission-only correction for the actual Pfew table grants and relevant creator defaults, preserving application CRUD/RPC permissions. Do not blindly modify platform/extension objects or all privileges. See the existing Phase 7 runbook, section on TRUNCATE grants.
3. The original upload trigger function allows anonymous EXECUTE, inherited from the earlier baseline. It is a trigger function, not an ordinary callable application RPC; this alone does not demonstrate unauthorized file access. Review its excess grants with the permission cleanup; do not treat it as a new 016 regression.

## Recommendation

**Schema compatibility: no conflict identified in the inspected objects for 015 followed by 016.** Do not replay 010–014. Both later migrations remain pending and were tested only against isolated local fixtures.

**Overall live readiness: NO-GO for unconditional sign-off until recovery is confirmed and the existing permission finding is addressed through a reviewed plan.** No additional generic export of the same four reports is needed now. The next information needed is the recovery status and the reviewed permission cleanup, rather than another hosted database.

After clearance, apply 015 separately, verify with the Phase 9 read-only report, then apply 016 separately and verify with the Phase 10 report. Compare original business counts/fingerprints during a quiet period, allowing for legitimate intervening writes. Follow `SUPABASE_PHASE9_10_SIMPLE_GUIDE.md`; do not remove real records for smoke testing.

Reference for the permission distinction: [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).
