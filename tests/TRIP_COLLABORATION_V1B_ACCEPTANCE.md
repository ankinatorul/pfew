# Trip Collaboration V1B — complete sharing experience

Implemented locally, 16 November 2026. Ready for local review; **not approved for live release yet**. Migration 019 remains prepared and unapplied. No live data writes, migration application, deployment, push, merge, credential requests, invitation delivery or sign-in emails were performed by this implementation/testing work.

## Screens implemented

- Finalized Trip Overview has a Share action. It reuses the existing accessible booking drawer: native modal, keyboard focus, Escape, scroll containment, return focus and mobile layout. Existing Home, sidebar, dashboard layout and six section pills remain in place.
- Owner: invite by email, create/copy link, pending invitations, confirmed revoke/reissue, accepted collaborators and confirmed removal. Duplicate pending requests show an error and focus the existing pending area. There is no attempt to recover an old plaintext token.
- Editors/viewers: read-only sharing information; no invitation/removal controls. Editors receive the existing Edit trip link when collaboration capability is available. Legacy viewers retain their existing role.
- Invitation URL: sign-in required, valid, accepted, already accepted, declined, expired, revoked, invalid and wrong-account recovery. Acceptance stays on a success screen until **Open trip** is clicked. Open remembers the trip through the existing user-scoped active-trip store.
- My Trips: compact intended-recipient invitation inbox, accept/decline feedback and Open trip. It renders nothing when empty. Completed feedback can be dismissed. Existing RLS-visible shared trips, Shared with you indicator and non-owner delete restrictions are reused.
- Documents: Private / Shared with trip labels; uploader-only explicit sharing, confirmation and current document revision. Passport & ID never offers sharing. Originals remain private by default. Other uploaders’ shared documents retain download access without rename/delete controls. Booking details no longer describe shared confirmations as private or offer another uploader’s removal control.
- Missing 019: unavailable sharing panel; no invite/member mutation controls, disabled eligible file-sharing actions, no false success or direct-table fallback. Existing trip functionality remains available.

## Existing infrastructure reused

V1A capability, hashed invitation creation, preview, recipient accept/decline, in-app inbox, revocation, membership management, shared trip details, file-scope RPCs, RLS and revision guards. No second membership system, copied trip records, public bucket, realtime system, notification system or paid service was added.

The existing BookingDrawer, Trip Overview header, My Trips list, Edit Trip form, signed attachment route, Documents cards, Google sign-in, PKCE callback, safe invitation-return cookie and active-trip reconciliation are reused. Accepted editors’ content permissions remain enforced by the existing SQL/RLS, not just hidden controls.

## Files changed for V1B

The pre-existing uncommitted V1A work is preserved. The following are V1B additions/edits, rather than a claim that every working-tree change began in V1B:

- Sharing UI/data: `lib/collaboration.ts`, `lib/sharing-data.ts`, `components/share-trip.tsx`, `components/share-trip-client.tsx`, `components/share-trip-panel.tsx`.
- Invitations: `components/invitation-experience.tsx`, `components/invitation-client.tsx`, `components/pending-invitations.tsx`, `app/invites/[token]/page.tsx`, `app/collaboration-actions.ts`, `app/trips/page.tsx`, `components/collaboration-view.tsx`.
- Header/drawer/styles: `components/trip-overview.tsx`, `components/trip-overview-view.tsx`, `components/booking-drawer.tsx`, `app/sharing.css`, `app/layout.tsx`.
- Privacy integration: `components/file-privacy-control.tsx`, `components/document-manager.tsx`, `components/packing-documents.tsx`, `components/packing-documents-client.tsx`, `components/booking-budget.tsx`, `components/booking-manager.tsx`, `lib/booking-budget.ts`.
- Authentication: `app/email-auth-actions.ts`, `components/email-sign-in.tsx`, `components/auth-options.tsx`, `lib/auth-providers.ts`, invitation-return handling in `app/actions.ts` logout.
- Prepared SQL: `supabase/migrations/019_trip_collaboration_v1a.sql` (recipient-safe preview status response only in V1B).
- Tests: `tests/collaboration-experience.test.tsx`, `tests/email-auth-actions.test.ts`, `tests/sharing-data.test.ts`, `tests/collaboration-actions.test.ts`, `tests/trip-collaboration-v1a-database.test.ts`, `tests/auth-options.test.tsx`, `tests/auth-providers.test.ts`, `tests/trip-overview-view.test.tsx`, `tests/booking-budget-reader.test.tsx`, `tests/browser/auth-shell.spec.ts`, `tests/browser/collaboration.spec.tsx`, `tests/fixtures/collaboration-browser.tsx`, `playwright.config.ts`.
- This report and `tests/screenshots/collaboration-v1b/` captures. Earlier generated screenshot changes and Next declaration changes are excluded. The unrelated duplicate `tests/shell-data.test 2.ts` is preserved.

## Invitation delivery and authentication

The owner sends a copied link themselves. Pfew does **not** send invitation emails. Tokens are generated by the existing server action, only SHA-256 hashes are sent to the invitation RPC, and hashes are never displayed/logged by these components. A newly generated link is held in UI memory; if lost, use confirmed revoke-and-reissue. Copy failure offers the normal Open invitation link as a browser copy-link fallback.

Google remains available according to the existing provider check. Email sign-in appears only when the existing Supabase public Auth settings explicitly report email enabled. The new form uses Supabase Auth `signInWithOtp`, existing PKCE cookie/callback and the safe invitation return path. It deliberately requests links for **existing accounts only** (`shouldCreateUser: false`), with a generic account-existence-safe response. A new recipient can first establish their account through working Google sign-in; non-Google account provisioning remains an operator decision.

No Auth settings, email templates, redirect allowlists or SMTP configuration were changed. No delivery test was performed. Email-provider availability does not prove delivery, sender authorization, rate limits or template compatibility. If configuration is absent, unknown or delivery fails, Google remains usable. Operators must verify the actual project configuration and callback origin before relying on email sign-in. Open a requested link in the same browser/profile that requested it for the current PKCE flow. If the invitation-return cookie has expired, reopen the original invitation link after signing in.

Reference: [Supabase passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Migration/release dependencies

**No new migration number was added.** The user explicitly identified 019 as prepared and unapplied, so its preview function was refined in the local file. It now returns detailed inactive states only to the verified intended recipient, and an authorized trip ID for already accepted invitations. Inactive states return no trip details. All mutation authorization, membership, file-scope and revision operations remain the V1A boundaries.

Invalid well-formed links and wrong-account links intentionally have the same generic response; exposing which one exists would leak invitation information. Malformed links have a separate invalid-link screen. This is a deliberate privacy limit, not an assertion that every bad link belongs to someone else.

Release V1A + V1B app and the reviewed 019 definitions together. The app expects the revised preview contract. Do not replay 019 blindly if it is discovered to have been applied somewhere: review actual definitions and prepare a forward-only update instead. Verify earlier schema dependencies, including 018, rather than assuming they are present. The existing `supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql` remains the administrator inspection script.

## Verification

- Lint: passed (`npm run lint`).
- TypeScript: passed (`npm run typecheck`).
- Full unit/isolated database suite: **472 tests, 103 files passed** (`npm test -- --maxWorkers=2`).
- Chromium browser fixtures: **48 passed** across desktop/mobile collaboration, navigation, trip management, booking/budget and packing/documents suites. This includes **10 new collaboration cases**. Separate signed-out/Google/protected-route browser regression: **2 passed**. After the final file-control/privacy-copy correction, the affected collaboration/booking/document suites were rerun: **34 passed**.
- Production build: passed (`npm run build`).
- Whitespace validation: `git diff --check` passed.

The PGlite cases execute real PostgreSQL roles, functions, triggers and RLS against isolated synthetic data. Existing V1A cases verify shared trip visibility, draft isolation, editor content/budget CRUD, owner-only actions, removal, private/shared Storage-row access and revision conflicts. Added assertions verify valid/already-accepted/declined/revoked/expired preview states and that a different verified user receives no details, including for expired invitations.

New UI/action tests cover invitation creation/copy, duplicate clicks, hashed token forwarding, pending revoke-before-reissue, removal confirmation/revision, accepted inbox feedback surviving refresh, decline, recoverable errors, active selection, missing infrastructure, provider-gated email requests and return paths, and uploader/Passport privacy controls. A booking-reader regression checks that another uploader’s shared confirmation remains readable without a removal control.

Browser tests inject the actual presentation components into an isolated in-memory fixture with mocked operations; they do not authenticate two real accounts or exercise hosted Storage HTTP. They verify focus, Escape/return focus, touch-sized controls, owner/editor/unavailable states, status recovery and no horizontal overflow at 320/375/768/1440px. No hosted database writes or email requests are performed. This is **simulated browser acceptance**, not production collaboration acceptance or multi-session race/load proof.

Screenshots: `tests/screenshots/collaboration-v1b/{desktop,mobile}/`: `owner-sharing.png`, `accepted.png`, `inbox-and-privacy.png`, `editor.png`, `unavailable.png`, `wrong-account.png`. Fictional fixture content only. Desktop and mobile captures were visually inspected.

## Security and remaining limitations

- File sharing is explicit; existing confirmations do not become shared automatically. Document category is user-entered metadata, not sensitive-content detection. Uploaders must choose deliberately.
- Fresh RLS checks enforce removal on reads/writes. Lists/active selection reconcile after refresh/navigation; no realtime synchronization is introduced. An already open screen may show stale content until refreshed, but new writes still use server authorization.
- An already issued signed download can remain usable for its existing 60-second lifetime. Downloaded/offline copies cannot be recalled.
- Existing cross-uploader deletion guards remain: another uploader’s private attachments can block booking/trip cleanup. Explicitly shared file cleanup follows V1A permissions. Do not promise unrestricted owner deletion.
- Full collaborator names/profile sharing are not added. Owners see known invited email labels; non-owners see You / generic collaborator labels where no authorized display name exists. Internal IDs are not rendered as names.
- Live metadata, backup restoration, hosted file access, email delivery and a real two-account journey are not newly verified here. No production readiness claim is made from fixture results.

## Exact operator steps for real two-account acceptance

Do these only after separate approval for the migration/release and deliberate test records. Use the existing single Supabase project chosen by the owner; no second hosted database is required by this implementation.

1. Confirm restorable database recovery and recovery of private Storage bytes. Keep credentials/backups private. Read-only count/hash exports are not backups.
2. Run the **whole** `supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql` in a new SQL Editor query. Export its report privately. Review actual prerequisites 001–018, function owners/grants, RLS/policies, constraints and private bucket configuration. Stop on discrepancies; do not weaken RLS or replay earlier migrations blindly.
3. Review the current prepared 019 transaction and coordinated app release. After explicit approval, an administrator applies the reviewed missing update as a whole transaction. Re-run the read-only report and compare expected metadata and old-field fingerprints/counts, allowing for investigated legitimate intervening user writes. No migration is applied by this report.
4. Use two separate browser profiles: **A = owner**, **B = intended recipient**, with verified email addresses. For the email path, first verify enabled email Auth, template/PKCE compatibility, allowed callback URLs, request limits and actual inbox delivery. Google is the fallback; email-only new-account registration is not added.
5. In A, deliberately create a disposable finalized trip through the existing Create Trip journey. Confirm a private draft has no sharing/invitation path. On the finalized Overview, open Share and invite B’s exact email. Confirm one pending invitation; copy the link. Pfew must say no invitation email was sent.
6. Before B accepts, open the link signed out: only sign-in instructions should appear. Try a different verified account: no trip name/details and no Accept button. Sign in as B, reopen the link, verify trip name and Accept/Decline. Confirm a pending item also appears in B’s My Trips.
7. Accept once in B. Confirm success remains visible, then click Open trip. Check My Trips has one Shared with you entry and the active-trip switcher selects it. Refresh and revisit the accepted link; verify accessible/already-joined behavior. Do not create another trip record.
8. Using disposable content only, verify B can edit allowed trip details, itinerary, bookings, budget/expenses and packing, and upload an innocuous test PDF. Verify B cannot invite/remove members, delete the trip or change ownership. Confirm edits are visible in A after refresh.
9. In A, upload innocuous fixture files: a ticket and a PDF categorized Passport & ID (no real identity data). Both start Private. Confirm B cannot list/download them. Explicitly share only the ticket; B can then open it through authorized expiring access, without another uploader’s rename/delete controls. Passport & ID must have no sharing option. Make the ticket Private again and refresh B; fresh access must stop.
10. In A, remove B with confirmation. In B, refresh My Trips and switcher: trip access must disappear; the old accepted invitation must not restore it. A prior active preference must resolve to an accessible trip or empty state after returning to My Trips. Fresh editing/download attempts must be rejected.
11. Reinvite B using a new link. Verify a duplicate pending request creates no extra invitation. Cancel revocation/removal first to confirm no change, then revoke and confirm the old link stops working. Use Create new link and verify only the replacement works. On another new invitation, B declines and never gains access.
12. Verify a naturally expired pending invitation presents expiry without acceptance. Do not modify live rows/expiry timestamps to force this test; artificial expiry is already covered locally. Expired/revoked states are only detailed to the intended verified recipient.
13. Clean up only these deliberate fixtures when approved. Do not remove real trips or another uploader’s private files to bypass deletion protections. Confirm owned trips, normal Google sign-in and draft creation still work.

**Recommendation:** GO for local V1B review. **NO-GO for live collaboration release until reviewed 019/prerequisites, recovery, coordinated app release and real two-account acceptance are complete.** Stop here for review; no push, merge, deployment or migration is authorized by this report.
