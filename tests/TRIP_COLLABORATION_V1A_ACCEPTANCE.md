# Trip Collaboration V1A — infrastructure and secure access

Implemented locally on 16 November 2026. **Migration 019 is prepared, not applied.** No live Supabase data writes, credential requests, deployment, push, merge, outbound email or new hosted database were performed. The unrelated duplicate test file is preserved.

## Existing architecture and findings

Pfew already uses `trips.owner_id` as its single ownership boundary. Migration 007 introduced unique `(trip_id,user_id)` memberships, editor/viewer roles, owner-managed invitations, SHA-256 token hashes, verified-email acceptance, audit events and shared-content RLS helpers. Migration 010 excludes private drafts from non-owner access; 013 finalizes the same draft ID. Later phases supply itinerary, booking, expense, packing and document revision protection.

The existing gaps were: direct owner CRUD on invitation/membership tables, no decline or durable revocation state, accepted-link retry able to re-establish removed membership, owner-only trip-detail UPDATE, and uploader-private file access without an explicit sharing scope. Existing file URLs already use authorized 60-second signed downloads. Trip listings already fetch finalized trips through RLS without an owner filter; active selection resolves persisted IDs against the fresh accessible list.

The repository's sign-in UI is Google-only, despite the brief describing magic links as already implemented. V1A accepts existing **verified email-provider sessions** through the shared session predicate/callback/file/offline routes, preserving Google support. It does not add a magic-link request form, change Supabase Auth settings, or configure an email provider. Those UX/configuration decisions remain explicit V1B handoff work.

## Schema prepared: `019_trip_collaboration_v1a.sql`

Extends the existing tables rather than copying trips or introducing another ownership model:

- `trip_members.revoked_at` and `member_revision`; existing unique trip/user constraint remains. Revocation retains the row and increments its revision.
- `trip_invitations.revoked_at` and `declined_at`, plus a recipient/pending lookup index. No plaintext invitation token is stored.
- `trips.trip_revision` for optimistic trip-detail saves.
- `booking_attachments.file_scope`, default **private**, with an explicit shared/private constraint and a Passport & ID restriction.

Existing business rows, owner IDs, bookings, invitation history, dates, attachments, paths and Storage bytes are not rewritten or deleted. Previously finalized trips remain finalized. Existing viewer memberships remain read-only for compatibility; **new invitations create editors only**. Old pending viewer invitations need owner review/replacement, not silent conversion to editors.

The migration intentionally tightens direct authenticated invitation/member mutation grants. **Legacy deployed actions that directly INSERT/UPDATE/DELETE these tables must be replaced by the new application actions in a coordinated release.** Existing trip/content reads remain compatible; this is not a claim that every older collaboration caller can continue mutating tables unchanged.

## Invitation and membership operations

Existing server actions now reuse authorization-safe SQL operations:

- `create_trip_invitation`: finalized-trip owner only, normalized email, seven-day expiry, one pending invitation per recipient/trip, and no general account-existence lookup. An already-active member can be identified only within that owner's trip. The application generates a fresh 256-bit random copy-link token and sends only its SHA-256 hash to Postgres.
- `preview_trip_invitation` / `accept_trip_invitation`: require the authenticated account's verified email to match. Wrong, expired, revoked, declined or unsupported invitations disclose no trip content. Acceptance records its receipt and creates/updates one existing membership row atomically.
- `decline_trip_invitation`: recipient-only decline, with no membership created.
- `list_my_trip_invitations` and `respond_trip_invitation`: in-app support for verified recipients without returning token hashes, other accounts or unaccepted trip content beyond their intended invitation summary. V1B can use this instead of copy links.
- `revoke_trip_invitation`: owner-only link revocation. Revoking an accepted link alone does not remove its membership; member removal is explicit.
- `manage_trip_member`: owner-only membership revocation/legacy role upgrade with expected revision. Removal also revokes that member's associated invitation links, including pending ones, so an old link cannot restore access. Only a fresh owner-issued invitation can later re-enable membership.

Access mutations lock the trip before invitation/member rows. Acceptance retries may return the existing trip while membership remains valid, but cannot resurrect removed access. Raw tokens are not logged or persisted in database rows. Copy links use the current browser origin, including localhost; Pfew does **not** claim to send invitation emails. Invitation pages prohibit indexing and use a no-referrer policy.

## Authorization and trip details

`can_read_trip` / `can_edit_trip` retain owner access and require an unrevoked membership plus finalized trip for non-owners. Their administrator-owned, schema-qualified security-definer implementations avoid membership-policy recursion. Existing child policies therefore recognize accepted editors for itinerary, activities, bookings, prep tasks, packing, monetary budgets and expenses without duplicating records.

`save_shared_trip_details` uses the existing trip identity, row lock and expected `trip_revision`. A trigger permits editor changes only to trip details and monetary preferences; owner identity, publication state, theme and internal draft data remain protected. Existing owner/deletion triggers, finalization boundary and child revision guards remain in place. The existing Edit Trip route supports editors after the capability is available and hides its owner-only Delete section. Delete remains owner-only in RLS and the existing authorized server action.

Known Pfew tables lose unnecessary `TRUNCATE` grants for public/anonymous/authenticated roles: RLS does not constrain TRUNCATE. This is a narrow permission correction for the known application table list, not platform/extension tables or application CRUD grants. Inherited TRUNCATE rights that remain cause the migration to fail for administrator review. Future default privileges still require review; this migration does not guess the live object creator's default ACL configuration.

No realtime subscriptions, service-role client, admin password handling or parallel trip state were added. Existing finalized-trip lists and active-trip eligibility continue to use fresh RLS-visible records. Removal becomes visible on refresh/navigation; prior downloaded copies cannot be retracted.

## Shared-file model

All legacy and newly uploaded files stay uploader-private by default, including booking confirmations. Accepted members do **not** gain access simply because a file belongs to a shared trip. `set_trip_file_scope` is an explicit uploader-only action, requires active editing access and the current document revision, and can share only finalized-trip files. Unfinished intake originals cannot be shared before materialization. Passport & ID entries cannot be shared. Other personal content is not automatically classified from bytes; uploaders must make an intentional sharing decision.

Shared files are readable by accepted trip readers through metadata RLS and private Storage object policies. Read permission does not grant editors permission to overwrite/delete another uploader's file. The trip owner may remove explicitly shared files through the existing authorized cleanup path, including after the uploader is revoked; other uploaders' private files remain protected. A restrictive private-file boundary protects metadata and Storage even when an additional permissive policy exists. Anonymous booking-file access and Storage overwrites are denied. The bucket is not made public, and existing path/checksum/receipt/identity guards are retained.

The Documents server query shows RLS-authorized shared files after the migration capability is detected; shared files from another uploader expose read/download controls, not rename/delete controls. Existing signed-download routes rely on both metadata and Storage authorization. Signed links already issued may remain usable for their existing **60-second lifetime** after revocation. Previously downloaded/offline copies cannot be remotely erased. Private uploaders retain their existing personal-account cleanup access after trip membership is removed; they do not retain shared-trip content access.

Existing protective deletion rules remain: deleting a booking/trip can be blocked while another uploader's private attachments remain. Explicitly shared files can be cleaned up by the trip owner, so revoking an uploader does not strand those files. V1A does not bypass that protection or delete collaborators' personal files. A broader owner cleanup policy would need an explicit product/security decision.

## Tests and results

- Lint: passed.
- TypeScript: passed.
- Unit and isolated database/RLS suite: **445 tests across 100 files passed**.
- Production build: passed.
- `git diff --check`: passed.

The new PGlite suite executes actual PostgreSQL roles, RLS, functions, triggers and Storage-object policies under isolated fixtures, not just mocked UI permissions. It replays the existing foundation/consolidated legacy baseline and 010–018, then 019, and runs the read-only verification script before and after. It verifies original-trip field preservation, legacy ownership, new draft/finalized-trip creation after migration, owner-only invitations, verified/wrong/unverified recipients, expiry, decline, duplicate pending invitations, revocation, retry/single-use behavior, editor deletion/ownership/invitation denial, owner revocation revisions, shared listing, draft and cross-trip isolation, editor content CRUD and budget editing, document uploads, personal-file isolation, explicit shared confirmation access, Storage deletion denial for another uploader, revoked access and anonymous denial. Known excessive TRUNCATE grants are simulated and verified removed.

New action tests check high-entropy token generation and hashing, no false success when RPCs are absent, and forwarding recipient decisions/membership/document revisions through the SQL boundaries. Route tests verify editor detail access without Delete, while viewers remain excluded. Existing permission, booking, draft, packing, private download and active-trip regressions remain included.

PGlite is an embedded PostgreSQL fixture, **not a full hosted Supabase stack**. Its Storage table models exercise real RLS but not the Storage HTTP service. Optimistic stale-write conflicts are tested; a multi-session network race/load test is not claimed. No live write-based, invitation-email-delivery or full browser collaboration journey was run. V1B should exercise those user flows after an approved migration and coordinated release.

## Migration prerequisites and handoff

1. Keep 019 unapplied until developer review. Continue using the owner's chosen single Supabase project; no second hosted project is required by this implementation.
2. Confirm restorable database recovery and separate recovery for private Storage bytes. Existing source code, aggregate hashes and inspection exports are not file backups. Do not share credentials or backup contents in chat.
3. Run `supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql` in SQL Editor and export its one report privately. It selects catalog metadata, grants, policy expressions, constraints, function fingerprints and aggregate data fingerprints; it does not run application RPCs or export personal rows/tokens. Review unexpected policies, owners, grants and forced-RLS settings against the intended definitions.
4. Review existing migrations 001–018 and the actual live objects. Earlier owner reports confirmed inspected 010–017 objects, but 018 remains unverified in this task. Do not replay earlier migrations blindly or assume CLI migration history exists. 019 uses the private-draft/document foundations introduced in 010–016 and was tested after 018.
5. Coordinate the new app actions with the migration, because older direct invitation/member mutations intentionally lose permission. Decide a quiet maintenance/release window. No application deployment or database approval is implied by this report.
6. Only after explicit approval, apply the reviewed missing updates in order. Run 019 as its **whole transaction**, separately. Stop on any error; do not retry partially, drop policies or disable RLS to make it pass.
7. Export the read-only report again and compare expected function/policy definitions, privacy defaults, old-field counts/fingerprints and bucket privacy. Legitimate intervening user writes can alter aggregate fingerprints and must be investigated rather than automatically restored.
8. Use deliberate owner-controlled test accounts/records for an approved manual owner/editor acceptance and revocation check, including signed files. Do not delete real trips or use other users' documents for tests.

**Live application recommendation: NO-GO until recovery, live metadata, prerequisites and coordinated-release review are complete.** Local isolated verification passed; no live administrator/schema inspection or migration application occurred here.

## Files changed

- New migration `supabase/migrations/019_trip_collaboration_v1a.sql` and read-only `supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql`.
- Existing collaboration actions, owner invitation/member components, collaboration view and `/invites/[token]` page.
- Existing trip save action, TripForm revision field, Edit Trip permission/delete handling, `Trip` type and `tripRole` revocation handling.
- Documents query/owner-only management controls and optional file ownership/scope types.
- Shared auth predicate/session, auth callback and attachment/offline guards to support existing verified email sessions alongside Google.
- New `tests/trip-collaboration-v1a-database.test.ts` and `tests/collaboration-actions.test.ts`; updated auth, private-download, documents-reader and trip-route regressions.
- This report. Generated Next declarations are restored; no visual redesign or new dependencies.

## Remaining V1B work

Build the invitation inbox/pending/declined/revoked UX using the prepared RPCs; complete the owner/member management and sharing consent surfaces; add clear per-file Shared/Private labels and personal-document guidance; complete refresh/active-trip/revocation feedback and browser QA. Decide whether to add the missing magic-link request UI using the existing Supabase Auth service. Outbound invitation email is not configured or sent; copy links and identity-bound in-app infrastructure are available without a new paid provider. Finalize the protective cross-uploader attachment cleanup policy before promising unrestricted owner deletion.

Stop for review. No Phase 11A.3 or unrelated screen redesign is included.
