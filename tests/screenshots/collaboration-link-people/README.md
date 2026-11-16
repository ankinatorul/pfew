# Link-only invitations and people panels

Desktop 1440×1000 and mobile 375×812 captures use real presentation components with synthetic accounts/files and in-memory operations. No live invitations, identities or file contents are used.

Key captures: `people.png`, `editor-people.png`, `copied.png`, `copy-failed.png`, plus existing sharing/recovery states. Long people lists scroll inside the panel. Full-page captures may include background beyond the current viewport below fixed dialogs.

Run `npx playwright test tests/browser/collaboration.spec.tsx --workers=2` locally. See `tests/COLLABORATION_LINK_PEOPLE_ACCEPTANCE.md` for the unapplied 020 dependency and limitations.
