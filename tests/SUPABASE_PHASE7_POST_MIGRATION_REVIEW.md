# Phase 7 post-migration report review

Source: user-supplied `pfew-phase7-admin-v1` report after the user applied migrations 010–013. The export ran as postgres with `read_only=on`. This review applied no SQL, invoked no live RPC and modified no live record or permission.

## Passed in the supplied report

- All nine expected new columns are present, with expected types/nullability/defaults.
- All eight checked RPCs exist. Their body hashes match the current repository's last applicable definitions in 010–013 exactly.
- Every checked RPC denies anon execution and allows authenticated execution.
- `finalize_trip_draft` is SECURITY DEFINER, owned by postgres with empty search_path. The other checked RPCs are invoker-security.
- RLS remains enabled on all 25 reported public tables.
- No reported constraint is unvalidated; no scoped trigger is disabled.
- The two policy replacements, eight new check constraints, replacement attachment path check and three new scoped triggers match the intended migration changes. No unexpected existing scoped constraint/trigger removal was reported.
- `booking-files` remains private, with the existing 3 MB PDF/JPEG/PNG configuration.
- Five existing trips remain, all with valid date ranges. Original-field trip fingerprints match the pre-migration export exactly.
- Booking and attachment counts/fingerprints also match the baseline (both tables had zero records). No orphan booking or wrong-trip segment link was reported. This does not demonstrate preservation of nonempty live bookings; isolated tests cover that scenario.

The absent CLI migration ledger is unchanged and does not negate manual SQL Editor application. Keep the applied files/hashes/history recorded rather than rerunning old SQL.

## Remaining finding

Both anon and authenticated still have effective TRUNCATE on all 25 public tables (50 flagged role/table combinations). This is unchanged from the pre-migration report. Migrations 010–013 intentionally fixed RPC grants but did not remove pre-existing table TRUNCATE grants.

The application does not require TRUNCATE. Prepare/review a narrow permission-only correction covering these Pfew tables and the actual table-creator defaults. Preserve ordinary RLS-scoped SELECT/INSERT/UPDATE/DELETE and RPC execution. No permission change was authorized or applied by this report review. PostgreSQL [RLS does not govern whole-table TRUNCATE](https://www.postgresql.org/docs/current/ddl-rowsecurity.html); this report is not evidence of a public HTTP destructive endpoint.

## Current outcome and next steps

**Migration/schema verification: PASS for the objects and preservation checks reported. Full operational/security sign-off: pending permission hardening and a real authenticated application journey.**

1. Refresh localhost, sign in and verify that migration-related setup gates disappear. Do not rerun 010–013.
2. Complete the reviewed permission cleanup and verify effective TRUNCATE is removed from the untrusted application roles.
3. Verify a genuine user-owned create/resume/upload/review/finalize/Open my trip workflow and existing-trip access. Do not introduce destructive fixture tests into the live project or treat administrator SQL success as proof of user RLS behavior.
4. Backup/recovery remains an operational requirement; the metadata report and fingerprints are not a backup. This review does not infer that one was taken before application.

No additional generic metadata export is requested for the already verified Phase 7 schema. Actual multi-user runtime access and backup status cannot be certified by this report alone.
