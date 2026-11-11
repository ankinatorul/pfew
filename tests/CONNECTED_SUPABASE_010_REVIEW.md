> Follow-up received and reviewed. The function/onboarding questions below are resolved; a small forward-only permission correction is prepared as migration 011. See [current follow-up review](CONNECTED_SUPABASE_FOLLOWUP_REVIEW.md). Application still awaits project-use and backup confirmation.

# Connected Supabase report review

Source: the user-supplied `pfew-010-single-result-v1` CSV report. This is a review of exported metadata, not a direct administrator connection or authorization to apply SQL. No live database records or settings were changed.

## Verified from this report

- PostgreSQL 17.11; report ran as `postgres` with `transaction_read_only=on`.
- 5 trips; no missing start/end dates and no reversed date ranges.
- 0 bookings; no orphan booking/trip links or invalid booking/segment links. The empty booking table means live-data booking preservation cannot be demonstrated from this snapshot; isolated fixture tests cover existing bookings.
- Trip and segment dates are NOT NULL. All 224 expected public column definitions match the isolated 001–009 schema.
- All 176 expected public non-NOT-NULL constraint definitions match. PGlite's PostgreSQL catalog separately represents NOT NULL constraints; those catalog-name differences were excluded, and actual column NOT NULL flags were compared instead.
- All 50 expected public index definitions and readiness flags match. No reported index is invalid/unready.
- All 47 expected public triggers match and are enabled. No extra public trigger was reported.
- All 45 expected public RLS policies match, with one additional owner-scoped policy on `trip_onboarding`. All reported public tables have RLS enabled. No public views were reported.
- 30 of 32 expected function body fingerprints match exactly, including the existing trip read/edit helpers, atomic trip creation, old `accept_ai_idea`, date/link validators other than `validate_destination_link`, booking imports and private-file guards.
- The connected report contains no draft metadata columns, `save_trip_draft` RPC or 010-specific draft triggers. It does not show the reviewed 010 schema installed on this target. This does not prove its history in other environments.
- No `supabase_migrations.schema_migrations` ledger exists in this snapshot. This is compatible with manual SQL Editor setup; it is not evidence that all earlier migrations are missing. Object comparison now establishes substantial 001–009 compatibility.

Original-field fingerprints are retained only in temporary private review files; this document does not reproduce them. Real trip/account details were not exported in the report.

## Newly established differences and remaining decisions

1. `valid_time_zone(text)` and `validate_destination_link()` have different body fingerprints. That can be formatting or a real behavior difference; hashes alone cannot decide. Their actual source must be reviewed. Migration 010 does not replace either, so their compatibility matters.
2. The target contains an additional `trip_onboarding` table, two associated indexes, five constraints, an owner-scoped policy and three RPCs: `create_onboarding_trip`, `complete_onboarding_draft`, and SECURITY DEFINER `reserve_onboarding_ai`. None exists in the checked repository. We must inspect these functions and aggregate old onboarding usage to establish whether they conflict with the new private-draft flow or represent older unfinished work. Do not delete or disable them based only on their names.
3. The six default-ACL rows give `anon`, `authenticated`, and `service_role` broad table/function/sequence grants for objects created by the listed administrator roles. A `PUBLIC` revoke does not remove a separate `anon` grant. Reproducing the reported default function grants in isolated PGlite confirmed that the present 010 leaves `anon` with EXECUTE on new `save_trip_draft` despite revoking PUBLIC. Its explicit authentication check still rejects anonymous creation; this is not evidence that anonymous users can read/write trips. Nevertheless, the claimed authenticated-only RPC ACL is not achieved under the actual defaults. A narrowly scoped, reviewed grant correction is needed before sign-off; do not globally rewrite project default privileges. Existing table grants also include TRUNCATE, which is not governed by row policies; actual exposure is not established by this metadata report alone and no TRUNCATE was attempted.
4. Backup/recovery availability and production/development separation remain unconfirmed. The five trips must be treated as real data unless the user confirms otherwise. An export with counts is not a recoverable database backup.

Prepared `supabase/COPY_TO_SUPABASE_FOLLOWUP_READ_ONLY.sql`: one read-only result containing only those five function definitions, old onboarding aggregate counts, and preference key names (not values). Source can contain hardcoded secrets in custom routines; keep the result private and redact credentials if any. This script does not invoke the functions it inspects.

## Recommendation

**NO-GO for application yet, for specific remaining reasons:** unreviewed legacy onboarding/differing routines, the explicit-anon RPC grant issue, and unverified target/recovery details. The prior generic missing-catalog blocker is substantially resolved by the supplied report. Do not ask the user to repeat the full metadata export.

Next: review the one focused follow-up export, confirm project purpose and recovery, then prepare only the necessary local permission/compatibility correction for review. Keep migration history intact if any revision was previously applied elsewhere. No migration or permission change is executed automatically.

Only review documents/read-only diagnostics were added during this report review. Migration 010 and application code are unchanged.
