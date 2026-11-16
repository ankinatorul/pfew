# Collaboration V1B fixture screenshots

Desktop (1440×1000) and mobile (375×812), rendered with the existing Pfew shell and real sharing presentation components. All accounts, trips, operations and files are isolated synthetic fixtures; these do not demonstrate live Supabase or two-account authorization.

Each directory contains owner sharing/copy link, invitation accepted, inbox/privacy, editor, migration unavailable, and wrong-account captures. The owner drawer is scrollable; a full-page capture may also include background content outside the current viewport.

Reproduce locally after a build with:

```sh
npx playwright test tests/browser/collaboration.spec.tsx --workers=2
```

See `tests/TRIP_COLLABORATION_V1B_ACCEPTANCE.md` for actual verification and release prerequisites.
