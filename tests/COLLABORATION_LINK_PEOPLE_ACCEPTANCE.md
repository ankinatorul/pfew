# Collaboration — link invitations and Shared with

Implemented locally. No live invitations/emails, data writes, migration application, deployment, push or merge. Existing migrations 018/019 and document permissions are unchanged.

- **Invite:** existing secure email-bound action, now “Invite someone” → Email address → “Create invite link.” Copy explicitly states Pfew will not send an invitation email. Pending entries show Pending/expiry and preserve revoke/reissue.
- **Copy:** selectable read-only URL and fixed-width “Copy link” button. After successful clipboard acknowledgement: checkmark + “Copied!” for 2 seconds, with a screen-reader status. Failure never shows success; a short inline error focuses/selects the URL for manual copying. Timers clean up when the link is replaced/closed.
- **Shared with:** one accessible header target, maximum three overlapping avatars plus +N; hidden for solo trips. Desktop uses a compact anchored dialog/popover; mobile uses a bottom sheet. The existing drawer focus, Escape, backdrop and focus-return behavior is reused. Initial focus avoids scrolling away the invitation labels.
- **People:** owner and current members, actual names/current verified account emails, truthful Owner/Editor roles (legacy Viewers remain Viewer). Photos use the existing Google-avatar allowlist with initials/error fallback. Owners may open Manage sharing; editors have no management controls. No realtime subscriptions; refresh/navigation loads fresh data.

## Database dependency — prepared, NOT applied

`supabase/migrations/020_trip_people.sql` adds **one authorized read-only RPC**, `trip_people(uuid)`, after 019. It checks the authenticated caller’s current access to a finalized trip before selecting just that trip’s owner/active members. It reads current `auth.users` identity fields and existing profile display names; it does not join invitation emails as identity information, expose general profiles, grant anonymous execution or return raw metadata. Only verified account emails are returned. No tables/data/RLS/Storage policies or invitation functions are modified.

**The avatar group/current identity details require approval and application of 020.** With 019 only, invitations/copy/revoke still work; profile details stay unavailable, and member management uses generic role labels rather than pretending an invited email is a current verified account identity. No unsafe profile-query fallback is used. Do not rerun or rewrite applied 019 for this change.

Accepted membership is independent of invitation-link expiry: expired unaccepted invitations never appear, while an accepted member stays visible until membership is removed. Existing private drafts cannot retrieve member details. Display names are account/profile data, not verified legal names; authorization uses authenticated IDs and membership, never the display name.

## Files

- UI: `components/invitation-link.tsx`, `components/trip-people.tsx`, `components/share-trip-panel.tsx`, `components/booking-drawer.tsx`, `app/sharing.css`.
- Avatar reuse: extracted unchanged `AccountAvatar` into `components/account-avatar.tsx`; `components/account-menu.tsx` keeps its compatible export and existing behavior.
- Data: `lib/collaboration.ts`, `lib/trip-people.ts`, `lib/sharing-data.ts`; prepared migration 020 above.
- Coverage: `tests/trip-people-database.test.ts`, `tests/trip-people-ui.test.tsx`, updated sharing-data/collaboration experience tests, browser collaboration spec and fixture. Original duplicate test file remains untouched.

## Verification

- Lint, TypeScript and production build passed.
- Full unit/isolated database suite: **481 tests across 106 files passed**.
- Desktop/mobile browser fixtures and existing booking/document regressions: **38 passed** (14 collaboration cases).
- Isolated SQL tests cover pending/declined/expired invitees, changed verified email versus old invited/spoofed metadata email, missing verified email, current membership, owner inclusion, removal, draft/cross-trip/anonymous/stranger denial and unchanged profile RLS/data. UI tests cover role controls, initials/photo filtering, compact avatar limits, clipboard acknowledgement/timer/failure, and refresh removal.
- Browser checks cover keyboard/touch, focus return, desktop/mobile presentation, owner management transition, copy failure selection, unchanged copy-button dimensions and overflow at 320/375/768/1440px. These are fixtures, not hosted two-account acceptance. The browser fixture supplies Next Image’s runtime shim; production uses Next.js normally.
- Screenshots: `tests/screenshots/collaboration-link-people/{desktop,mobile}/` includes people, editor-people, copied and copy-failed captures. Earlier screenshot baselines are preserved. Desktop/mobile captures were visually inspected.

Stop for review. A real two-account check follows separate approval for the prepared 020 and matching application release; no approval is inferred here.
