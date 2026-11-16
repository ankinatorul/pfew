# Reusable trip sharing — local acceptance

Implemented one reusable trip-level join link. The owner enables it once, copies the same link across refreshes/devices, and can reset or disable it. There is no expiry, recipient field, email delivery, pending-invitation UI, or new per-person invitation record. Copy acknowledgement lasts two seconds, keeps button dimensions stable, and offers a selectable URL on clipboard failure.

## Migration and compatibility

Prepared **022_reusable_trip_sharing.sql**; NOT applied to connected Supabase.

- Requires migration **019** and its 001–018 dependencies. **020** remains required for authorized names/emails in the existing People panel.
- **021 is not required.** Both 019→022 and 019→021→022 were tested in isolated PGlite fixtures. Do not apply 021 after 022: it would restore retired invitation RPC grants. Do not replay 019/020/021 over this release.
- Adds one `trip_share_links` row per enabled trip, with an enabled flag and optimistic revision; adds a capability RPC and owner management, authenticated preview and join RPCs.
- Owner server actions generate 32 cryptographically random bytes. Join lookup uses a SHA-256 hash. A recoverable secret is also retained in this restricted table so owners can retrieve the same URL on another device. This is **not hash-only storage**. RLS is enabled with no direct API-role table grants or policies; only the authorized owner management RPC returns the secret. It is absent from ordinary trip queries, preview responses and member responses. Do not export this table or log owner RPC responses.
- Retires API execution grants for legacy recipient/single-use creation, preview, acceptance, decline and inbox RPCs (including optional 021 creation). `/invites/[token]` displays a retired-link message without looking up its token. Historical invitation records remain unchanged; they are never converted to unrestricted links. Already accepted memberships remain unchanged.
- Does not rewrite existing trips, bookings, membership records, attachments, dates or private Storage policies. Existing member management and content RLS are reused.
- Transactional, single-application migration; not intended for repeated execution. No new environment variables or providers are required.

Application release must match 022: the old invitation application will no longer be able to create/accept invitations after its grants are retired. Without 022, the new drawer reports that reusable sharing is unavailable and offers no link mutation. Deploy the matching application in the same release window after explicitly approved database application; neither operation was performed here.

## Access behavior

- `/join/[token]` requires authentication before any trip preview. Google sign-in returns to the same join URL using the existing validated callback flow; independently configured authentication remains unchanged.
- A signed-in holder sees only a trip name and explicit Join trip confirmation. Merely opening/previewing never creates access. Invalid/disabled links reveal no trip details.
- Joining uses the existing trip ID and editor membership. It locks the parent trip and link row and revalidates the secret after locking; repeated joins of an active editor do not change membership revision or duplicate records. Already accessible members open the trip directly.
- Disable/reset immediately invalidate the old bearer URL. Re-enable after disable creates a different secret so disabled URLs never revive. Existing members retain access.
- Removed members lose access. They can explicitly rejoin with the current reusable link; owner UI and removal confirmation explain this and offer Reset link.
- Owner-only link management, collaborator removal and trip deletion remain enforced server-side. Editor permissions and revision guards for shared details/destinations, itinerary, bookings, budget/expenses, packing/preparation and eligible own-file sharing are retained and tested.
- Private documents and another uploader's private files remain protected. People panel retains authorized current account names/emails and roles, desktop popover/mobile sheet, focus return and owner-only management. Overview now displays a member count.

## Verification

- Lint: passed.
- TypeScript: passed.
- Full Vitest suite: **499 tests / 110 files passed**.
- Isolated database coverage includes schema preservation, with/without 021, multiple distinct authenticated accounts using one link, owner restrictions, anonymous denial, explicit joining, idempotency, reset/disable/re-enable, stale owner revisions, removal/rejoining, legacy API retirement, private files, draft/cross-trip isolation and the existing editor workflow regression assertions.
- Browser fixtures: **14 checks passed**, across desktop and mobile. Include copying/two-second reset/manual fallback, stable URL after drawer reopening, owner reset/disable/removal, People panel, uploader controls and 320px overflow checks. Historical invitation view tests remain isolated regression fixtures; they are not active application entry points.
- Production build: passed on retry. Next.js emitted a security-upgrade advisory on an earlier build attempt; no dependency upgrade was made in this scoped change.
- Screenshots: `tests/screenshots/reusable-trip-sharing/{desktop,mobile}/`.

Tests use local in-memory SQL and mocked authenticated users/UI operations. They do not constitute real Google OAuth, live two-account acceptance, or a multi-connection concurrency stress test. Those remain manual checks after an explicitly approved matching release. No live database writes, migration application, emails, deployment, push or merge occurred.

## Files for review

Migration 022; `app/join/[token]/page.tsx`, retired `app/invites/[token]/page.tsx`, `app/collaboration-actions.ts`, `app/trips/page.tsx`; `components/join-trip.tsx`, `share-trip-panel.tsx`, `invitation-link.tsx`, `trip-people.tsx`, retired unused `InviteForm` in `collaboration.tsx`; `lib/auth-redirect.ts`, `sharing-data.ts`, `collaboration.ts`; related action/loader/auth/People/UI/browser tests and fixtures. Shared editor assertions were extracted into a test helper, preserving the previous single-use-link test coverage as historical compatibility coverage. Earlier uncommitted editor conflict fixes and unrelated files were preserved.
