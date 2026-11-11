# Navigation shell — local review

This phase changes shared tokens and navigation. Home content, the trip dashboard grid, forms, authentication, Server Actions, schema, and storage controls retain their existing behavior.

The trip create/update/delete actions now invalidate the root layout so its authorized trip list refreshes. Their data operations and permission checks are unchanged.

## File inventory

Created:

- Styles: `app/shell.css`.
- Shell components: `components/app-shell.tsx`, `components/app-shell-view.tsx`, `components/public-shell.tsx`, `components/sidebar.tsx`, `components/active-trip-switcher.tsx`, `components/mobile-navigation.tsx`, `components/navigation-link.tsx`.
- Existing-feature entry points: `app/trips/page.tsx`, `app/help/page.tsx`, `components/trip-documents.tsx`.
- Navigation/data helpers: `lib/app-navigation.ts`, `lib/active-trip-store.ts`, `lib/shell-data.ts`.
- Verification: `tests/app-navigation.test.ts`, `tests/app-shell.test.tsx`, `tests/shell-data.test.ts`, `tests/navigation-invalidation.test.ts`, and this guide.

Modified:

- `app/globals.css`, `app/layout.tsx`, `app/actions.ts`, `app/trips/[id]/page.tsx`.
- `components/trip-navigation.tsx`, `components/trip-navigation-view.tsx`, `lib/trip-navigation.ts`.
- `tests/travel-navigation.test.tsx`, `tests/browser/navigation-layout.spec.tsx`.

Reused: bundled Manrope, Lucide, `AccountMenu`, `TripCollection`, `RemoveAttachment`, existing attachment-download endpoint, protected access helpers, Supabase client/RLS, and the existing trip-section URL builder. No dependencies or components were deleted. The former header is extracted into `PublicShell`; the old compact trip dropdown is replaced by the shared mobile More disclosure. Desktop trip tools remain available.

## Preview

Run `npm run dev` and open `http://localhost:3000`. Sign in with the existing Google flow. Development is local, but the configured Supabase fallback is a hosted project; use appropriate test records for save/upload checks. No migration or environment change is needed for this phase.

## Review checklist

- Desktop (1024px and wider): cobalt sidebar, Current trip immediately below the logo, Home / My Trips / Itinerary / Bookings / Packing / Documents, Create a Trip card, Settings, Help & Support, signature. Active navigation uses lime with charcoal text. No Favorites tab or top-level Budget.
- Mobile/tablet (below 1024px): compact header, Current trip selector, Home / Trips / Itinerary / Bookings / More bottom navigation. Check 320px, 375px, and 768px widths, browser zoom, and long trip names.
- More opens with Enter/Space. Tab through its links. Escape closes it and returns focus; clicking outside closes it. Packing, Documents, Budget, Prep, Map, Research, People, Offline, and trip overview remain reachable.
- Switch between accessible trips from Itinerary, Bookings, Packing, Documents, and Budget. Supported sections carry over. A day outside the new trip resets to its first day. Record-editing parameters do not carry over. Switching from owner Settings to a shared trip opens the trip overview.
- Reload, reopen Home, and navigate through existing trip links. The browser remembers only the trip ID per account, validates it against the accessible list, and keeps the existing Home `?trip=` selection in sync. Browser storage being unavailable must not block navigation.
- Check an empty account, a shared viewer account, and an unavailable trip list. Trip settings remain owner-only. An inaccessible trip URL must not borrow another trip's context.
- Documents shows only the signed-in user's attachments for that trip. Pending uploads do not receive download links. Download/removal uses existing handlers. New uploads remain in Bookings; all uploader-owned files remain manageable from Your account.
- Login, setup, error, callback, and invitation URLs do not receive the authenticated sidebar. Existing account-menu keyboard behavior and sign-out still work.
- Create a trip and delete a disposable trip in an appropriate test context. Confirm that the accessible trip selector refreshes after the Server Action completes; check both navigation and a full reload.

## Automated verification

```sh
npm run lint
npm run typecheck -- --incremental false
npm test
npm run build
npm run test:e2e
```

Browser shell tests render the real components and stylesheet with explicit synthetic trip IDs. They cover layout, keyboard activation of the native More disclosure, secondary links, and empty/shared contexts. They do not simulate an authenticated Google session or establish live cross-account authorization.

Completed checks: lint and TypeScript passed; Vitest passed 197 tests across 54 files; the local production build passed; Playwright passed all 14 tests. Shell checks include 320, 375, 768, 1024, and 1440px widths. The restricted-sandbox build stalled and was stopped; the same default Turbopack build succeeded outside that sandbox. Build-generated `next-env.d.ts` was restored to the user's original working copy and TypeScript was checked again. Environment files, database migrations, offline assets, Home content, and the original screenshots were verified unchanged against the checkpoint.

Still unverified: fresh authenticated Google flows and real cross-account switching/documents. Figma comparison remains unavailable under the account's MCP tool limit. Home Travel HQ and the lifecycle-aware Trip Dashboard remain separate future phases.

## Rollback checkpoint

Before implementation, a file-hash-verified source/Git checkpoint was saved at `/private/tmp/pfew-before-shell-20261106T133310Z`. It includes original tracked/untracked work, screenshots, ignored environment files, and Git metadata. Only generated `node_modules` and `.next` directories were excluded. The checkpoint contains private configuration; keep it private and copy it to a durable private location if long-term retention is needed.

Read its `RESTORE.md`. Extract into a new empty directory rather than over this workspace, run `npm ci` there, and compare files before restoring anything. A Git reset to HEAD would discard the user's pre-existing work and is not the rollback procedure.
