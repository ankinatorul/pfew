# Email-free collaboration invitations

Implemented locally, 17 November 2026. No live writes, test invitations, emails, migration application, deployment, push or merge. Authentication methods are unchanged.

- Share: one **Create invite link** action, no email input or invitation email copy. Existing Copy link / Copied! (2 seconds, fixed width, checkmark, accessible announcement) and selectable manual-copy fallback are reused. Each new link admits one account and expires in seven days.
- Join: signed-out visitors see no trip details. A signed-in, non-anonymous account with a valid unused link sees the trip name and **Join trip**. Opening/previewing never joins. “Not now” does not consume the link. Acceptance creates an Editor membership on the existing trip ID; success has an explicit Open trip action.
- Security: existing 256-bit server-generated tokens and SHA-256 database storage retained. Owner-only creation/revocation, trip-before-invitation row locks, one accepted account, safe same-account retry while the link and membership remain valid, and rejection of other-account reuse/revoked/expired tokens. Supabase anonymous accounts as well as the SQL anonymous role are excluded. Owner/already-active editors see Open rather than consuming an unused link.
- Legacy: existing invitation rows default to `invitation_kind='email'` and retain their verified recipient binding through the existing 019 response operation. They are never converted to unrestricted links. Legacy decline/in-app inbox behavior remains; legacy entries can be revoked but are not automatically reissued as unbound links.
- Shared with is preserved. Current account emails render only inside the authorized People panel, not the invitation page or Share drawer. No profile, private document, Storage or other trip RLS policies are relaxed.

## Exact migration dependency

Prepared **`supabase/migrations/021_link_invitations.sql`**, not applied. Requires 019. It adds the invitation-kind discriminator, allows a null email only for new `link` rows, adds the link capability/creation RPC, and replaces preview/accept with compatible dispatch for legacy versus new links. Existing membership/business/file rows are not rewritten. The original 018/019/020 files are unchanged; **do not replay 019**. 020 remains required for authorized avatar/member identities, independently of accepting new links. Existing managed booking/date behavior still requires 018.

Before 021 is available, new-link creation is disabled and no email-bound workaround is used. Existing recipient-restricted links remain usable. After approval, apply 021 once as its whole transaction and use the matching app. Older Share drawers do not understand recipient-free rows; the matching release should replace them. Old 019 fingerprint reports will correctly show changed preview/accept bodies after 021; this is intentional, not a reason to reapply 019.

## Editor route/action review

| Feature                     | Existing path and enforced behavior                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trip details                | Edit Trip → `saveTrip` → `save_shared_trip_details`; expected trip revision, editor-safe fields, no owner change/delete                                                                                         |
| Destinations/detailed plans | Existing Destinations/SegmentForm → `saveSegment`/`deleteSegment`; trip RLS/date guards retained; submitted itinerary revision now filters edits/deletes to reject stale forms                                  |
| Activities                  | Existing Itinerary → `change_itinerary`; same IDs, trip authorization and revision checks                                                                                                                       |
| Bookings                    | Existing Bookings → managed booking save/removal, 018 finance revisions, private-file cleanup guards; editor manual creation and own-file attachments work. Owner-only bulk draft collection remains owner-only |
| Budget/expenses             | Existing monetary budget/expense operations, expected totals/finance revisions and shared-trip RLS                                                                                                              |
| Packing/preparation         | Existing packing/reminder RPCs and preparation actions, current-trip RLS and existing revision guards; no new owner-only restriction                                                                            |
| Documents                   | Existing authenticated uploader-owned paths, private defaults, revision-aware explicit sharing. Another uploader’s private files remain inaccessible and can block destructive booking cleanup                  |

Owner-only collaborator management, entire-trip deletion and ownership protections remain enforced in SQL/server actions. Changes become visible after refresh/navigation; no realtime service or separate trip copy is introduced.

## Verification

- Lint and TypeScript passed. Duplicate generated `.next` route declarations encountered after builds were preserved outside the generated type directory and TypeScript was rerun; no application type checks were disabled.
- **490 tests across 108 files passed**, including isolated PostgreSQL/RLS cases with distinct authenticated users. New tests cover first claim, second-account denial, anonymous denial, unchanged legacy binding, revocation/expiry, retry/removal/reinvite, accepted legacy memberships, preserved bookings/private originals, editor content CRUD and cross-trip/draft/private-file denial. Owner reads confirm the editor’s persisted changes; stale mutations fail.
- **38 desktop/mobile browser checks passed**, including no email input, copying/fallback, explicit Join, Shared with, owner/editor controls, trip editing and existing booking regressions. Fixtures use synthetic accounts and in-memory operations; this is not a live two-account acceptance claim or multi-session race/load test.
- Production build **passed on retry**. Its first run completed compilation/type generation but stopped on a Next.js security-upgrade notice that requested a retry. A framework security update is recommended; dependencies were left unchanged in this scoped task.
- `git diff --check` passed. Screenshots: `tests/screenshots/email-free-collaboration/{desktop,mobile}/`; mobile sharing was visually inspected. Historical screenshot baselines and the unrelated duplicate test file are preserved.

## Files changed

Migration 021; `app/collaboration-actions.ts`, `app/invites/[token]/page.tsx`, `lib/collaboration.ts`, `lib/sharing-data.ts`; existing Share/compatibility invitation components, invitation experience and PersonDetails email visibility; `app/actions.ts`, `components/forms.tsx`, `lib/domain.ts` and detailed segment delete callers for revision submission; collaboration action/UI/loader/browser fixtures and tests; new `tests/link-invitations-database.test.ts`, `tests/segment-revision-actions.test.ts`; this note and new screenshot captures.

Stop for review. No permission to apply 021 or release the app is inferred from local test success.
