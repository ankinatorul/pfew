# Supabase audit and exact developer setup plan

Read-only audit after Phase 7E. No application code, environment settings, connected records or migrations were changed/applied. New artifacts are this runbook, `supabase/VERIFY_PHASE7_READ_ONLY.sql` and its isolated regression test.

## 1. What is verified now

Fresh public-key GET requests selected **zero rows** and read public Auth settings. No application RPC was invoked.

| Item | Observed |
| --- | --- |
| Effective target | `saxraiqvelmeoeazaccd.supabase.co`, the project identified by the user as live |
| Local URL/key source | `config/public-deployment.json` fallback, not an explicit development-project override |
| `trips.creation_state` | Missing (`42703`) |
| `trips.theme` | Missing (`42703`) |
| `bookings.reservation_status` | Missing (`42703`) |
| `booking_attachments.intake_id` | Missing (`42703`) |
| Existing `trip_onboarding` columns | Zero-row query succeeds; this does not establish its contents |
| Google provider | Enabled in public Auth settings |
| Email provider | Disabled in public Auth settings |

The schema supporting the new three-step journey is therefore missing. The current repository depends on migrations **010, 011, 012 and 013**. This is a schema/configuration mismatch, not evidence of a browser-cache failure.

Important: `lib/deployment-config.ts` uses `environmentValue || committedDefault`. Leaving Supabase variables missing **or blank** can silently select the live fallback, even while `NEXT_PUBLIC_SITE_URL` is localhost. A local frontend is not an isolated database.

The previous administrator exports established substantial core 001–009 compatibility and contained extra legacy onboarding objects. Those are historical snapshots; they do not prove today's full constraints/functions/RLS/backup state. No privileged connection is available here. Supabase CLI, Docker and `pg_dump` were not found on this machine's current PATH.

## 2. What each required migration supplies

| File in `supabase/migrations` | Required for |
| --- | --- |
| `010_private_trip_drafts.sql` | Private creation state, ordered draft metadata, progress/revisions, owner-private helpers/triggers and save RPC; legacy-safe idea acceptance |
| `011_explicit_draft_rpc_permissions.sql` | Explicit PUBLIC/anon execute revocation for draft/idea RPCs under Supabase's reported default grants |
| `012_booking_collection.sql` | Owner-private booking intake, staged private uploads, checksums, separate reservation status, reviewed-booking/materialization RPCs |
| `013_trip_review_and_finalization.sql` | Stable theme, saved travel style and atomic owner-authorized same-ID finalization |

Trip start/end dates remain mandatory. These files do not set monetary budgets, enable paid services or create OAuth credentials.

## 3. Recommended action now: create an isolated hosted development project

This avoids changing the database used by the existing live website. Do not copy production trips/accounts/private documents into it just to test the POC. A local Supabase stack is an alternative, but would require installing its CLI/container prerequisites first; it is not currently configured in this repository.

1. In Supabase, create a **separate project** clearly named `pfew-dev` (or select an existing genuinely isolated development project). Verify its project reference differs from the live reference above. If project limits prevent this, evaluate a local stack rather than automatically purchasing an upgrade.
2. Open **that development project's** SQL Editor. In a fresh/empty project, paste and run each numbered migration as a complete file, **one at a time, in this order**, stopping on any error:

   ```text
   001_foundation.sql
   002_guided_destinations.sql
   003_travel_essentials.sql
   004_private_booking_files.sql
   005_automatic_locations.sql
   006_trip_intelligence.sql
   007_collaborative_trips.sql
   008_private_upload_reservations.sql
   009_research_and_booking_imports.sql
   010_private_trip_drafts.sql
   011_explicit_draft_rpc_permissions.sql
   012_booking_collection.sql
   013_trip_review_and_finalization.sql
   ```

   Use the normal trusted project administrator for migration execution. Each file already has BEGIN/COMMIT; do not concatenate nested transactions or strip protections to force a failed migration through. Do not reset an existing populated project. For an existing development database already verified through 009, apply only the unapplied reviewed 010–013 instead.
3. Do **not** run `supabase/upgrade_phase2_to_phase4.sql` after 010–013. Its older helper definitions can overwrite draft-aware authorization. The old README/UPGRADE instructions stop at 009 and are not a complete setup guide for the current journey. The absence of a CLI migration ledger does not mean existing SQL Editor migrations should be replayed. Keep an application log/hash/history for manually run files.
4. Run the complete [VERIFY_PHASE7_READ_ONLY.sql](../supabase/VERIFY_PHASE7_READ_ONLY.sql) in a **new** SQL Editor query. It returns one `phase7_report` result. Export that row as CSV privately. After full development setup, expect:
   - Every expected column and RPC `present = true`.
   - All listed RPCs: `anon_execute = false`, `authenticated_execute = true`.
   - `finalize_trip_draft` is SECURITY DEFINER, with empty search path and a trusted migration-administrator owner; its publication guard and full source match reviewed migration 013. The other listed application RPCs are invoker-security.
   - Application tables have RLS enabled; the policies/triggers match the reviewed migration sequence, with no extra permissive policy that exposes private drafts/files.
   - `booking-files` exists, `public = false`, `file_size_limit = 3145728`, allowed MIME types PDF/JPEG/PNG.
   - No orphan booking or wrong-trip segment links.
   - Review any `truncate_grants` result before treating permissions as ready; see section 6.
5. If RPC discovery is stale after committed DDL, a development-project administrator may run `NOTIFY pgrst, 'reload schema';` in SQL Editor, then retry. This is a proposed cache refresh, not something executed by this audit. It does not substitute for missing migrations.

## 4. Configure the existing local app for that development project

Edit your ignored `.env.local` yourself; do not put credentials in chat or commit them. **Fill both matching Supabase values** from the new project's connection/API settings:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<DEV_PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<DEV_PROJECT_PUBLISHABLE_KEY>
NEXT_PUBLIC_SITE_URL=http://localhost:3000

AI_MODE=mock
```

Do not use the live project's key with the dev URL, and do not use a service-role/secret key as a publishable key. The app uses signed-in-user sessions/RLS. Keep `.env.example` placeholders out of the real values; blank values still fall back to live defaults.

Stop/restart `npm run dev` after changing environment values. If using `npm run start`, rebuild with the development environment first; the public values are compiled into the app. Use `http://localhost:3000` consistently, not a mixture of localhost/127.0.0.1. Inspect the browser's Supabase request host to confirm the new dev reference before any sign-in/upload/create test. Avoid changing the committed fallback or existing live deployment configuration for this local setup.

### Configure Google sign-in for the development project

1. Supabase dev project → Authentication → Sign In / Providers → Google: enable it and configure the existing authorized Google Web OAuth client ID/secret privately. Disable Email/other unwanted providers for the approved Google-only flow.
2. In Google Cloud → that OAuth client's **Authorized redirect URIs**, add:

   ```text
   https://<DEV_PROJECT_REF>.supabase.co/auth/v1/callback
   ```

   Leave the live project's existing callback intact. A separate client is optional; reusing the authorized client with an additional dev callback is sufficient if its consent/test-user configuration allows it.
3. Supabase dev project → Authentication → URL Configuration:

   ```text
   Site URL:     http://localhost:3000
   Redirect URL: http://localhost:3000/auth/callback
   ```

   The Google-to-Supabase callback and Supabase-to-Pfew callback are different URLs. Review Google's consent-screen test-user restrictions if sign-in is denied. No new paid Google Maps/Places service is required for Google login or Photon destination search.
4. Sign in fresh in the isolated app. This creates a development Auth account, not a production account copy. Start a new login after provider changes instead of replaying an old OAuth code.

Official references: [Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Check Storage and optional services

Do not manually create a public bucket to make uploads work. Migration 004 creates/configures private `booking-files`; 008/012 supply the required upload reservation, metadata/path checks and Storage access policy behavior. If a bucket/policy differs, inspect the actual catalogs/source rather than disabling RLS or bypassing the existing metadata-first upload workflow.

- Manual bookings, deterministic labeled-text parsing, style/theme selection and basic trip creation do not need AI credentials.
- PDF/image content extraction requires the existing configured live reader, `AI_MODE=live` and server-only `AI_API_KEY`, plus explicit user consent/quota handling. In mock/unconfigured mode, retain the original and review manually; do not expect automatic OCR from uploading alone.
- Photon/OpenStreetMap destination search uses the existing integration; do not replace it or buy a key to solve the missing database schema.
- `GOOGLE_PLACES_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` are optional for their existing Places/map features, not prerequisites for Create Trip. Do not enable billing automatically.

## 6. Additional permission finding that needs action before live approval

The **historical administrator export** explicitly granted TRUNCATE on `trips`, `bookings` and `trip_onboarding` to both `anon` and `authenticated`. This was verified by parsing the exported relation ACLs, not by executing TRUNCATE. Fresh effective grants cannot be inspected with the public key; the new script reports them.

The app does not need TRUNCATE. PostgreSQL RLS does not constrain it. This is not a demonstrated public HTTP wipe endpoint—normal PostgREST table APIs do not themselves expose arbitrary TRUNCATE—but it is unnecessary database-level privilege and should be removed through a reviewed permission change before sign-off.

In the **isolated development project**, review each flagged Pfew table/permission source. For example, for direct grants on the three known core tables:

```sql
-- PROPOSED PERMISSION CHANGE. Not part of the read-only checker.
-- Review and test in the separate dev project first. Not run by this audit.
begin;
revoke truncate on table public.trips, public.bookings, public.trip_onboarding
  from public, anon, authenticated;
commit;
```

Do the corresponding reviewed revocation for any other flagged Pfew-owned tables; do not blindly rewrite extension/platform-owned objects. Check inherited/PUBLIC grants if effective privilege stays true. Also remove the unnecessary future-object TRUNCATE grant for the actual table-creator role(s), scoped to public tables, through the same separately reviewed permission plan. Do not globally replace all project defaults or remove the CRUD privileges required by RLS-scoped app operations. Re-run the checker: Pfew tables should no longer appear with effective TRUNCATE for these untrusted application roles.

Existing 010–013 handle RPC execution revocations; they **do not** remove these old table TRUNCATE grants. This audit does not silently edit their history or add/apply a permission migration against the live database.

PostgreSQL reference: [RLS and whole-table operations](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## 7. Real development acceptance before any live migration

Run the isolated automated checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Then, **only after confirming every network request uses the dev project**, manually test with two test Google accounts:

1. Account A: create two independent drafts with required names/destinations/both dates. Refresh/resume each; verify they do not appear in finalized trip lists or active selection.
2. Upload PDF/JPEG/PNG fixtures, add a reviewed manual booking and unfinished entry; reopen originals. Exercise upload/read failure/retry, without relying on paid AI for basic acceptance.
3. Select each style, navigate back/edit/resume, then create the trip. Verify stable ID, a single finalization after double-click/retry, correct theme/style and no invented budget/date data.
4. Open the new trip and verify active selection, normal bookings, unfinished Bookings review and original private file access. Edit travel style; existing expenses/reservations must stay unchanged.
5. Account B: verify A's draft, intake, original file downloads and owner-only finalization RPC are denied. Check actual shared finalized editor/viewer permissions separately; do not use an administrator/service-role client to claim RLS is passing.
6. Exercise stale trip/booking updates from separate tabs/connections, a lost finalization response/reload, existing finalized trips/booking relationships and signed versus unsigned file access. Delete only isolated test fixtures using the app's authorized cleanup/confirmation paths.

PGlite and browser mock suites are useful but do not certify real Supabase Auth, PostgREST, Storage or multi-connection locking. Those remain unverified until this development acceptance is completed.

## 8. Live database procedure — later, not authorized by this audit

Current recommendation: **GO for isolated development setup/testing; NO-GO for applying changes to the shared live project now.**

Before live application:

1. Verify a current restorable backup, a successful restore rehearsal and separate private Storage object recovery. Database backups contain Storage metadata, not file bytes. The Backups upgrade message alone establishes neither recovery nor a need to buy a plan. Use the [official manual backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) if appropriate; [backup coverage](https://supabase.com/docs/guides/platform/backups) explains the Storage limitation. Keep exports/credentials private and outside the repo. No local dump/restore tool is currently installed here.
2. Reinspect live catalogs and actual history. Preserve customized legacy onboarding objects/data. Do not infer history from a missing ledger, a single missing column or IF NOT EXISTS. Review the full SECURITY DEFINER finalizer source/owner/grants and the permission hardening above.
3. Arrange a quiet write window and save a fresh pre-change `VERIFY_PHASE7_READ_ONLY.sql` report. It excludes all intentionally added Phase 7 fields from original-data hashes. The old baseline scripts exclude only 010's fields and can falsely report changed hashes after adding `theme`/`reservation_status` in 012/013; use this updated baseline for 010–013 comparisons.
4. Only after separate explicit approval, apply the reviewed unapplied migrations and reviewed permission correction in the tested sequence. If an older variant has been applied elsewhere, prepare the appropriate forward-only change; do not overwrite that history.
5. Before fixture/user writes, run the same read-only report again. Existing trip/booking/attachment counts and original-field fingerprints should match during the quiet window; expected new defaults/metadata are intentionally excluded. Investigate mismatches. Verify schema, grants, RLS, triggers, Storage and existing live-client compatibility before releasing new app code.
6. Record the migration history/hashes and a forward-fix/recovery plan. Do not routinely drop draft columns, disable RLS or restore an old whole database over newer user writes.

## 9. Documentation/observability follow-up

The main README, `supabase/UPGRADE.md`, and `/api/health` still describe the earlier schema through 009 (`schemaVersionRequired: 9`). They are not proof that the current Create Trip schema exists. Update that guidance/health metadata to reflect the current 013 dependency before handing off/releasing; keep the distinction between configuration presence and actual schema verification. This audit reports the mismatch without modifying production code.

## 10. Audit validation

Fresh live checks: public-key GET only, zero returned trip/booking rows; Google enabled/Email disabled. Historical table ACLs were reviewed locally. Four existing isolated database/RLS files passed seven tests. The new read-only diagnostic passed its isolated pre-010/post-013 test, including nonempty original trip/booking fingerprint preservation, required RPC grants, private bucket flags and detection of an explicitly granted TRUNCATE privilege. Lint passed. TypeScript encountered duplicate generated Next.js declarations; byte-identical copies were moved to a private temporary directory before rechecking; TypeScript then passed. No destructive permission operation was executed against the live project.
