# Collaboration V1C — release readiness and migration audit

Audit date: 16 November 2026. **NO-GO for applying 019 or opening live collaboration yet. GO for completing the read-only/recovery checklist below.** This report is a plan, not permission to change the database, deploy, push or merge.

## 1. Readiness summary

| Evidence                                            | Result                                                                                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local V1A/V1B implementation and acceptance reports | Reviewed, including pending source changes, current actions/UI and V1B preview contract                                                                                                                                            |
| Local numbered migration history 001–018 → 019      | Replayed successfully in an isolated PostgreSQL fixture; 019 preserved original finalized-trip fields                                                                                                                              |
| Accidental second execution of 019                  | Fails on an existing object; transaction rollback leaves the first successful installation intact. **019 is not replay-safe**                                                                                                      |
| Connected project configuration                     | Next.js uses `lib/deployment-config.ts` and the committed browser-public defaults when environment overrides are absent. Target host: `saxraiqvelmeoeazaccd.supabase.co`; configured production default: `https://pfew.vercel.app` |
| Fresh live read-only Auth settings                  | HTTP 200: **Google enabled; email disabled**. No emails sent and no Auth configuration changed                                                                                                                                     |
| Fresh live administrator schema/RLS/ACL inspection  | **Not available in this audit.** No administrator database connector or new catalog export was supplied                                                                                                                            |
| Migrations already applied live                     | Earlier user reports/exports are historical evidence only. **018 remains unverified; 019 is reported prepared/unapplied, not freshly proven absent**                                                                               |
| Restorable Postgres backup / private file recovery  | **Not verified**                                                                                                                                                                                                                   |
| Real two-account acceptance                         | **Not performed**; requires approved deliberate test writes                                                                                                                                                                        |
| Deployment                                          | Current V1A/V1B changes are uncommitted/untracked locally. No evidence that this exact build is live                                                                                                                               |

The first standalone environment-only probe found no Supabase URL/key, but that was **not the effective Next.js configuration**: `next.config.ts` injects the existing public fallback. The corrected effective-config GET succeeded. `.env.local` currently supplies a localhost site origin. Localhost is still a frontend for the same live database; it is not isolated. No environment changes are needed or authorized by this finding.

The repository is on `main`, HEAD `df64833`. Release preparation must include **all** intended V1A/V1B files, including currently untracked components, SQL and tests, rather than deploying only the tracked diff. Preserve/exclude the unrelated duplicate `tests/shell-data.test 2.ts` deliberately. Do not reset or overwrite pending work.

## 2. Migration dependency matrix

All files below are under `supabase/migrations/`. A file or capability marker is not proof of live installation. The required outcome is matching final objects/behavior, not blindly replaying old SQL.

| Migration                       | Required foundation / representative verification                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 001 foundation                  | Trips, segments, profiles, date constraints, ownership FKs, date/timestamp triggers, RLS                                                                                                         |
| 002 guided destinations         | Destination relationships, destination-link trigger and `valid_time_zone(text)`                                                                                                                  |
| 003 travel essentials           | Bookings, prep, packing, budgets, expenses, immutable trip links and date guards                                                                                                                 |
| 004 private booking files       | Attachment metadata, private `booking-files` bucket and initial Storage policies                                                                                                                 |
| 005 automatic locations         | Geographic fields, destination timezone synchronization and linked timezone updates                                                                                                              |
| 006 trip intelligence           | Shared helper foundations, suggestions/research preparation dependencies and service usage controls                                                                                              |
| 007 collaborative trips         | `trip_members`, `trip_invitations`, unique trip/user and token-hash constraints, `owns_trip`, child shared policies, owner preservation, audit and cleanup guards                                |
| 008 upload reservations         | Pending/ready file states, upload guards, Storage insert checks and cross-uploader deletion protection                                                                                           |
| 009 research/imports            | Idempotent booking imports, research links and existing review operations                                                                                                                        |
| 010 private drafts              | `creation_state`, draft fields/revisions, private-draft validation, no-draft membership/invitation triggers, draft-aware access                                                                  |
| 011 draft RPC permissions       | Explicit authenticated-only draft/AI workflow grants                                                                                                                                             |
| 012 booking collection          | Owner-private `trip_onboarding`, intake/checksum attachment fields, pending/review/materialization RPCs and reservation status                                                                   |
| 013 finalization/themes         | Stable trip ID finalization, theme/publication boundary and required-date revalidation                                                                                                           |
| 014 itinerary                   | Revision fields/guards and authorized `change_itinerary(uuid,jsonb)`; required for collaborator itinerary editing                                                                                |
| 015 bookings/budget             | Finance revisions, expense links and authorized booking/expense/monetary-budget operations                                                                                                       |
| 016 packing/documents           | Packing/readiness revisions, document category/name/revision fields, metadata/upload/packing guards and RPCs                                                                                     |
| 017 payment due                 | `bookings.payment_due_date date`, payment-deadline trigger/function                                                                                                                              |
| **018 unified booking editor**  | Exact `save_managed_booking(uuid,uuid,integer,jsonb)` revision/date-aware implementation plus `managed_booking_editor_version()`; marker alone is insufficient                                   |
| **019 collaboration V1A + V1B** | Revocation/revisions, private file scope, RPC-only collaboration mutations, editor detail editing, recipient-safe preview, restrictive file/trip/Storage boundaries and narrowed TRUNCATE grants |

The consolidated `supabase/upgrade_phase2_to_phase4.sql` is an alternative historical baseline, not an update to run after 010–019. Replaying it can overwrite newer authorization/function definitions. The existing V1A tests exercise that baseline; V1C additionally tests the actual individually numbered 001–018 chain.

Full application dependencies include the existing private Storage HTTP service, JWT/Auth user identity and verified email, trusted function ownership, earlier child-table grants/RLS, secure session cookies, public deployment configuration, current application actions, and a browser capable of normal authenticated navigation. No new paid provider is required for owner-sent invitation links or Google-based acceptance. Existing-trip bulk booking collection remains owner-only; editors can add bookings manually and attach their own confirmations to saved bookings through existing functionality.

## 3. Migration 019 and security review

**No change to 019 was made during V1C.** No concrete source-level failure requiring an automatic SQL patch was found against the tested baseline. Live safety is still conditional on the missing catalog/recovery checks.

- **One transaction:** `BEGIN` through `COMMIT`; ordinary transactional ALTER/CREATE/REVOKE/GRANT/index work. No `CONCURRENTLY`, out-of-transaction external action, row DELETE or bulk business-data UPDATE. Error before commit requires transaction rollback, not a partial rerun.
- **One-time assumptions:** some columns/index use IF NOT EXISTS, but the Passport constraint, triggers and policies use plain CREATE. Existing columns are not retyped/revalidated by IF NOT EXISTS. A partial/custom/previous 019 installation must be investigated. Do not “fix” duplicate errors by skipping statements, dropping policies or disabling RLS.
- **Existing data:** new revision/revocation fields preserve existing identities; existing membership rows remain active unless previously revoked; finalized trips stay finalized. All existing files receive private scope when the column is newly added. No booking, trip dates, attachment paths or Storage bytes are reclassified/deleted. Partial pre-existing file-scope/category data can instead cause validation failure; inspect it before approval.
- **Behavior changes to review:** new invitations are editor-only. Existing viewer memberships remain viewers; old pending viewer invitations are retained but no longer accepted by the new flow. Owner review/replacement is required, not automatic conversion. Removing a member revokes their associated links. Revoking only an accepted link is not the same as removing membership.
- **Permissions:** direct INSERT/UPDATE/DELETE/TRUNCATE on membership/invitations are removed from end-user roles; owner actions must call the new RPCs. Known Pfew tables also lose excess TRUNCATE grants, which RLS does not constrain. Unexpected inherited/column-level grants and custom public tables require review; 019 does not solve every possible project grant/default ACL.
- **Functions:** SECURITY DEFINER operations use qualified names, empty search paths, explicit identity/ownership/email checks and trusted administrator ownership. CREATE OR REPLACE preserves existing owners/grants; the final block pins selected EXECUTE grants, but is not proof that every older/custom function is safe. Review `owns_trip`, timezone/audit/upload/finalization functions as well as 019 routines. End-user roles must not be superusers, BYPASSRLS roles, table owners or able to assume a privileged owner. Review role inheritance and FORCE RLS; ownership-sensitive helper recursion must remain avoided.
- **Invitation safety:** 256-bit random tokens are hashed in the existing action. Only the verified intended email can accept. Parent locks serialize membership/invitation mutations; revisions protect stale membership updates. A removed member cannot reuse a revoked old invitation to regain access. No invitation emails are sent.
- **V1B preview:** valid/accepted/declined/revoked/expired states are returned only to the verified recipient. Inactive responses contain no trip details. Invalid and wrong-account links are intentionally indistinguishable. An accepted link can show expiry after its original expiry time; membership is independent and remains reachable via My Trips unless removed.
- **Trip permissions:** finalized accepted members read; editors change permitted details/content; owner identity, private drafts, publication state and owner-only deletion stay protected. Existing RLS-visible lists and active-trip resolution are reused.
- **Files:** uploader-private by default, explicit uploader opt-in and document revision required; Passport & ID and unfinished intake originals cannot be shared. Private bucket and separate SELECT versus mutation policies remain essential. Another editor cannot overwrite/delete another uploader’s files merely because they can read a shared file. Owners may clean up explicitly shared files; other uploaders’ private files can still block trip/booking deletion.
- **Limits:** existing signed URLs last up to 60 seconds; downloaded/offline copies cannot be recalled. Refresh is needed to update visible lists. Categories are user-entered, not sensitive-content detection. PGlite models Storage RLS rows, not the hosted Storage API or all concurrency conditions.

File fingerprints for the exact audited artifacts:

```text
019 SHA-256: 3aba9e71a25ab0ee2703e1d8a108aa3b47e1da98eb682020b6d8277763f32ad8
018 SHA-256: fe00238f76638939fe7b42e93b3473a776e768e8051d03f4cd5b42d922ad171f
```

Expected function **body_hash** values, confirmed in isolated Postgres:

| Function                                                  | Expected MD5 of `prosrc`           |
| --------------------------------------------------------- | ---------------------------------- |
| `save_managed_booking(uuid,uuid,integer,jsonb)` after 018 | `6217a62c84105de7f3c97f9b6fbba144` |
| `managed_booking_editor_version()` after 018              | `6ebceba1516d1b8c52d508dc3039fc26` |
| `preview_trip_invitation(text)` after reviewed 019        | `1acfdb9b9ed5425c829bf71ca9a86593` |

Hashes are exact-text comparison aids, not security attestations. Formatting changes can differ harmlessly; a difference still needs private source review. Owner, grants, signature and security settings must also match.

## 4. Required operator actions — exact pre-release checklist

Keep the existing single hosted project. No second hosted development database is required here. Complete these items before approving any release write.

### A. Recovery evidence

1. In Supabase, confirm the **project reference** above is the intended live project. Open Database → Backups and record available recovery timestamp, retention, recovery method and who can restore. A project label or upgrade prompt is not recovery proof.
2. If a suitable hosted recovery option is unavailable, arrange a private logical backup with a trusted administrator. No automatic purchase is necessary. It must cover schema, application data, required roles/grants, Auth relationships, custom functions/triggers/policies and relevant Auth/Storage metadata/customizations. A default schema-only CLI dump is insufficient. Verify the installed CLI version and its managed-schema exclusions using the [official backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Supabase CLI, `pg_dump`, `psql` and Docker were not found on this audit process’s PATH; no backup was generated here.
3. Keep backups outside the repository/chat, encrypted with restricted access. Record timestamp, checksums, nonempty sizes, export exit status and verified restore instructions. Keep credentials/passwords local to the administrator’s secure connection setup; never paste them into chat, commit them or place them in command history.
4. Prove restoration in a disposable **local recovery environment**, not by overwriting the live database. This is a recovery rehearsal, not a second hosted development project. Check tables/counts, key relationships, custom functions/policies and permissions. Record only pass/fail and timestamp in the release evidence. File existence or `pg_restore --list` alone is not proof of successful restoration. If no safe restore rehearsal or equivalent verified recovery evidence is available, this gate stays open.
5. Separately back up **actual private Storage bytes**, preserving bucket/object keys and a private checksum/size manifest with matching attachment metadata. Use authorized Storage export/download tooling with restricted local credential handling, not public URLs or public buckets. Verify a sample recovery into a private disposable local destination. Do not list filenames, paths or personal contents in shared evidence. A Postgres backup contains Storage metadata but **does not recover the stored file bytes**. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).
6. Record the supported data-loss window and restoration downtime. Capture a final consistent baseline/backup during the controlled release window; account for new records/files written after an earlier backup. Recovery verification must not itself restore or modify the live project.

### B. Run the read-only SQL reports

1. Open Supabase → SQL Editor → **New query** in the intended live project. Copy the whole `supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql` file, including BEGIN/COMMIT, and run it. Export the **one `collaboration_report` result** privately as JSON/CSV with timestamp/project label.
2. Open another new query. Copy the whole companion `supabase/VERIFY_COLLABORATION_V1C_READ_ONLY.sql` file and run it. Export its **one `collaboration_v1c_report` result** privately. This adds exact column types/defaults, all public routine ACLs/fingerprints (including 018 and `owns_trip`), valid indexes, views, effective membership grants including column permissions, Storage relation metadata, catalog dependencies and booking relationship/count/hash checks. It does not run application RPCs or export user rows.
3. In the second result, look at `migration_ledger`. If it is non-null, run this **separate** query and export its small result privately:

   ```sql
   begin transaction read only;
   select version, to_jsonb(m)->>'name' as name
   from supabase_migrations.schema_migrations m
   order by version;
   commit;
   ```

   If null, skip this query. SQL Editor updates may have no CLI ledger. Missing ledger rows do not prove missing objects; ledger rows do not prove unchanged definitions. Do not repair or fake history during this audit.

4. Review the matrix against **actual definitions**, not filenames/marker presence. All 001–018 foundations above must be compatible. In particular, verify 018’s exact routine signature/body hash, marker, 017 date column/trigger, and 015 revision guards. Do not rerun 001–018 simply to populate history.
5. Before 019, its added objects are expected to be absent. If any already exist, compare definitions and stop for explicit review; 019 is not idempotent. Inspect existing file-scope defaults/constraints if that column is present. Any draft membership/invitation anomaly, broken booking link, invalid index, unexpected trigger or custom view requires review, not automatic deletion or cleanup.
6. Review every relevant RLS/policy, including extra permissive policies, and table/column grants, inherited roles, function owners/EXECUTE/search paths, object owners and default ACLs. Expect public/anonymous execution of privileged app RPCs to be denied; authenticated execution must remain available where intended. After 019, direct end-user membership/invitation INSERT/UPDATE/DELETE (including column grants) and known-table TRUNCATE must be false. Review Storage’s existing permissive read policy as well as the new restrictive boundaries; restrictive policies alone do not grant access.
7. Review function/view source privately in Supabase when a hash or dependency is unexpected. For example, to inspect 018 **locally in SQL Editor**, run only this block; do not export/share custom source containing secrets:

   ```sql
   begin transaction read only;
   select pg_get_functiondef(
     to_regprocedure('public.save_managed_booking(uuid,uuid,integer,jsonb)')
   ) as definition;
   commit;
   ```

   Use the same pattern for a specifically reviewed signature. A missing signature returns null. `pg_depend` does not discover every PL/pgSQL or dynamic SQL body dependency; hashes and dependency catalogs do not replace source review. Custom security-definer views/functions must not leak drafts or private files.

8. Verify `booking-files` exists, is **not public**, and its limits/MIME types and upload/read/delete/no-overwrite policies match the app. Inspect aggregate counts/fingerprints from both reports. Keep them for the post-change comparison. Do not SELECT personal rows, auth tokens or document paths to “prove” readiness.

Catalog exports contain policy/permission information and should be shared only privately with the reviewer. A safe status update is “report ran read-only; pass/fail; counts unchanged; backup verified on date.” Do not post keys, passwords, invitation tokens/hashes, backup contents or file/user data. No fresh administrator catalog output was obtained in V1C, so all gates in this subsection remain pending.

### C. Authentication and domain checks

- Existing effective production default is `https://pfew.vercel.app`; verify the **actual deployed** configuration and intended canonical domain before release. `NEXT_PUBLIC_SITE_URL` must point to that production HTTPS origin in the release, not localhost or an unrelated preview deployment. Local `.env.local` currently uses `http://localhost:3000`. On Vercel, the existing config normalizes invalid/local site origins to the committed production default; it does not prove deployment settings are correct.
- Preserve the working Google provider. In Google’s OAuth client, the authorized redirect URI is **Supabase’s callback**, `https://saxraiqvelmeoeazaccd.supabase.co/auth/v1/callback`. In Supabase Authentication → URL Configuration, the app callback must be allowed: `https://pfew.vercel.app/auth/callback`, plus `http://localhost:3000/auth/callback` only where intentionally needed for local use. These are two different callback hops. Verify canonical app origins and any intended custom-domain equivalents; no setting is changed by this audit. [Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
- The invitation link uses the current browser origin. Create test links on the intended app origin; a localhost link is not reachable on another person’s computer. Do not send Vercel preview/localhost links as production invitations.
- Sign-in return uses a validated `/invites/<64 hex characters>` path in the existing HttpOnly/SameSite cookie (10-minute lifetime), then `/auth/callback` exchanges the PKCE code and returns there. Preserve same browser/profile, hostname, HTTPS and cookies through the flow. If the return cookie expires, reopen the original invitation after signing in. No arbitrary external return URL is accepted.
- Fresh public settings report **email disabled**. The request form is therefore intentionally hidden. Email is optional and not required for Google-based two-account testing. Do not enable it or add a provider automatically. If separately approved later, verify sender/delivery limits, email template versus code-exchange callback compatibility, redirect allowlist, rate limits and real delivery. The form requests existing accounts only (`shouldCreateUser:false`); it does not implement email signup. No sign-in email was sent. [Passwordless requirements](https://supabase.com/docs/guides/auth/auth-email-passwordless).
- Do not put service-role keys in browser variables. Existing URL/publishable key defaults are deliberately public; no new keys or billing are required for this scope.

## 5. Exact coordinated release sequence — future approval required

A database transaction and an app deployment cannot be made globally atomic. The aim is to avoid routing users to legacy direct-table actions after permission removal.

| App / DB combination                         | Expected behavior                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Legacy app + pre-019 DB                      | Existing behavior, subject to actual prior schema                                                                        |
| Matching V1A/V1B app + compatible 001–018 DB | Existing owned trips remain usable; new sharing stays unavailable/disabled without 019                                   |
| Legacy app + 019 DB                          | **Avoid:** old invitation creation/role/removal actions directly mutate membership/invitation tables and lose permission |
| Matching V1A/V1B app + reviewed 019 DB       | Intended release combination; still needs hosted two-account verification                                                |

1. **Prepare, without release writes:** finish recovery/catalog/Auth gates; resolve earlier-migration gaps separately; freeze/review the exact source bundle and SQL hashes. Prepare the matching build and an identified compatible recovery build. Current V1A/V1B files must be included. Do not push or deploy from this audit.
2. **Request explicit release approval** for the exact app bundle, database transaction, maintenance window, deliberate test records and recovery procedure. A previous “migration applied” report or this document is not that approval.
3. **Establish an operator-controlled maintenance/access window** before cutover. Pause app writers/jobs and restrict public access to old production and directly reachable old deployment URLs. Drain in-flight legacy actions; ask users to reload after release. The repository has no dedicated maintenance gate in this change: its actual operational mechanism must be agreed before proceeding. Do not disable RLS or relax grants as a substitute. If writers cannot be quiesced, assess the remaining incompatibility/data-recovery risk explicitly; do not promise zero downtime.
4. **Publish/switch to the matching V1A/V1B app first, while 019 is absent**, under the maintenance restriction. Its capability gates keep sharing unavailable; owner trip edits retain their existing fallback. Verify health, protected routes and the correct project/domain, without exercising real-data edits. Keep old app instances drained/inaccessible. This ordering improves on a database-first cutover that would strand legacy direct-table collaboration actions. Stale tabs can require reload; do not assume all old requests disappear instantly.
5. **Capture final pre-change evidence** while writers remain paused: rerun both read-only reports, capture the final verified backup/Storage recovery point and record timestamps. If 019 unexpectedly exists, stop and review instead of replaying it. Earlier missing prerequisites require their own reviewed plan, not a bulk `db push`.
6. **Administrator applies the reviewed 019 whole transaction only after approval.** Preserve its BEGIN/COMMIT. It does not currently set its own lock/statement timeout; approve bounded execution with the administrator. For SQL Editor, an explicitly reviewed execution copy may insert `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';` immediately after its existing BEGIN, retaining one COMMIT. Record that execution-copy difference/hash. On lock/statement/error timeout, stop, roll back if the session remains aborted, and inspect. Do not skip failing statements or blindly rerun after uncertain completion.
7. **Keep maintenance active; verify after commit:** rerun both reports, confirm exact new columns/defaults/constraints, RLS/triggers and 019 V1B preview hash, authenticated RPC grants, effective DML/TRUNCATE denial and private bucket. Compare pre-existing field fingerprints/counts, including bookings. Under a genuine write freeze they should match; investigate unexpected differences. Wait for normal PostgREST schema visibility/capability availability rather than repeatedly applying SQL. Never use service-role application access to hide a schema/cache problem.
8. **Operator-only smoke/acceptance:** use the deliberate two-account checklist below on the matching app, including a phone-width browser and actual authorized private-file HTTP access. These writes require the separate approval in step 2; none are performed by V1C. Check logs without recording invitation tokens or private documents.
9. **Reopen to users only after acceptance passes.** Monitor permission failures, sign-in/callback failures, missing RPCs, uploads and revocation behavior. Save release identity, SQL execution record and private verification results. Keep a compatible app build and recovery evidence available. If a gate fails, maintain restricted access and follow section 6.

## 6. Recovery considerations

- **Before COMMIT / failed transaction:** rollback releases its uncommitted DDL/grants. Inspect actual catalogs and application health before deciding what to retry. A timeout, network interruption or missing SQL Editor response is not proof that COMMIT failed; check read-only first.
- **App fails before 019:** while maintenance remains active, returning to the known previous app is possible subject to normal deployment/session compatibility review; the schema has not crossed the permission boundary.
- **019 committed:** do not simply roll back to legacy HEAD `df64833`, because it needs direct membership/invitation DML. Prefer a compatible V1A/V1B build or a separately reviewed forward fix. There is no audited down migration included here. Do not grant old permissions back, drop restrictive policies or delete revocation state to get old code working.
- **Restoration is a last resort:** requires separate explicit approval, public/writer restriction, known restore point, loss/reconciliation of post-backup writes and matching Storage bytes. Restoring an older database can restore older, weaker policies and make newly uploaded files inconsistent with metadata. Recheck grants/RLS, identities, counts and files before reopening. Preserve incident evidence privately.
- SQL changes do not recall downloaded copies or already issued signed URLs. Do not promise immediate erasure after revocation.

## 7. Two-account acceptance — plain-language checklist

Only after the release/operator test approval above. Use two browser profiles/windows with **separate signed-in Google accounts**, A (owner) and B (collaborator), and only a newly created disposable trip with harmless sample files. No real passports, tickets, expenses or existing user trips.

1. **A:** create a trip named “Collaboration test — delete later.” Open its Overview → Share. Enter B’s exact verified email and choose Create invitation link. There should be one pending invitation, and Pfew must not claim it sent an email.
2. **A:** copy the link and send it yourself. Use the agreed reachable app address, not localhost. Creating another invite for the same address should show the existing pending invitation.
3. **B:** open the link signed out, then sign in with B’s invited Google account. Before accepting, the trip should not appear as an accessible trip. If signed in as A instead, no trip details or Accept button should be disclosed; switch accounts.
4. **B:** Accept. Wait for “You’re in!”, then click Open trip. Check My Trips shows one shared trip and the current-trip switcher selects it. Refresh: it should stay available, with no duplicate trip.
5. **B:** add/edit one disposable itinerary activity and one manually entered booking. Add a harmless confirmation file to that saved booking. **A:** refresh and check the saved content. Do not expect owner-only bulk booking collection to become shared.
6. **B:** set/change a small test monetary budget and add a disposable expense; change a packing item and its packed state. Refresh in A and B to confirm the same saved state. B should not see Delete trip or collaborator-management actions.
7. **A:** upload an innocuous PDF as Tickets and another as Passport & ID (just a sample PDF, never an actual identity document). Both start Private. **B:** must not see/download either. **A:** explicitly Share the Tickets file. **B:** refresh, open it, and confirm there is no control to rename/remove another uploader’s file. Passport & ID must never offer Share.
8. **A:** make the Tickets file Private again. **B:** refresh; a new download request must be denied. Previously downloaded files or signed links may remain available briefly as described above.
9. **A:** cancel the Remove collaborator confirmation once; B should keep access. Then confirm removal. **B:** refresh My Trips, then try the old link/old trip address: access must not return. Returning to My Trips must clear/replace an inaccessible active-trip selection.
10. **A:** invite B again with a new link. B should regain access only after accepting that fresh invitation. Revoke a separate pending invitation and confirm its old link stops working; Create new link should invalidate the old one. On another fresh invitation, B chooses Decline and gains no access.
11. Confirm A’s normal owned trips/Google sign-in still work. Clean up **only** these approved disposable records; have each uploader handle private sample files if deletion guards block cleanup. Do not remove anyone else’s real files to bypass a guard. Record pass/fail only. Natural invitation expiry can be observed later; forced expiry is already tested locally and must not be simulated by updating live rows.

## 8. Verification performed in V1C

- `npm run lint`: passed.
- `npm run typecheck`: passed after isolating an accidental duplicate generated `.next/types/routes.d 2.ts` declaration. The intermediate run failed with duplicate `LayoutProps`; the generated duplicate was preserved outside `.next` in a private temporary directory, and the check was rerun successfully. No application source was changed to hide the error.
- `npm test -- --maxWorkers=2`: **473 tests across 104 files passed**, including isolated database/RLS coverage.
- New `tests/trip-collaboration-v1c-readiness.test.ts`: verifies the individual 001–018 chain, required-date draft/finalization, original finalized-row preservation after 019, exact 018/V1B preview hashes, safe failure/rollback of a second 019 execution, and both read-only report scripts on pre/post-019 fixtures. Passed again after the supplemental report/hash assertions were added.
- `npm run build`: passed locally; no deployment.
- `git diff --check`: passed.
- Browser fixture evidence: V1B’s 50 desktop/mobile checks are prior evidence, **not rerun or represented as new live two-account tests in this audit**. No application UI code changed in V1C.
- Fresh live HTTP check: public `/auth/v1/settings` only, using the effective public configuration; HTTP 200, Google true/email false. An initial sandbox network failure was retried successfully with read-only network access. No account records or live application RPCs were queried.
- Fresh live administrator schema/backup/Storage restoration checks: **not performed; awaiting operator evidence**. No service-role key/password was requested. Local fixture roles/Storage tables do not prove hosted behavior.

Files added in V1C: this report; `supabase/VERIFY_COLLABORATION_V1C_READ_ONLY.sql`; `tests/trip-collaboration-v1c-readiness.test.ts`. Existing V1A/V1B changes remain intact. Migration 019, production code and environment configuration are unchanged by V1C. Generated Next declarations are restored after the build.

## 9. GO / NO-GO and outstanding blockers

**GO:** local audit/test evidence, recovery planning and administrator read-only inspection.

**NO-GO now:** applying 019, unrestricted live release or claiming production collaboration works.

Outstanding gates:

1. Verified restorable Postgres recovery **and separate private Storage byte recovery**.
2. Fresh administrator reports/source review proving actual prerequisites, especially 018, and whether 019 is truly absent; acceptable grants, function owners, RLS, indexes, views and policies.
3. Review of existing viewer/pending invitations, draft anomalies and any custom/partial schema differences.
4. Frozen, complete release bundle and an agreed maintenance/draining mechanism plus compatible recovery build.
5. Confirmed deployed canonical domain, callback allowlist/Google OAuth configuration and verified recipient accounts. Optional email stays unavailable until separately approved/configured/tested; it is not a blocker to Google-based testing.
6. Explicit approval for the exact migration/release and disposable two-account writes, followed by successful hosted acceptance before reopening.

**Next action:** complete recovery evidence and run/export the two read-only SQL reports in section 4B. Review those results before requesting approval for the coordinated release. Do not run 019 yet. This audit stops here pending explicit approval.
