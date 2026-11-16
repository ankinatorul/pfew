# Email-free collaboration fixtures

Desktop/mobile snapshots use the actual presentation components with synthetic identities and in-memory invitation operations. They do not demonstrate live acceptance. Captures include email-free Share, copying/failure recovery, accepted state, people panels and unavailable/restricted states.

Reproduce with `npx playwright test tests/browser/collaboration.spec.tsx --workers=2`. See `tests/EMAIL_FREE_COLLABORATION_ACCEPTANCE.md` for migration 021 and the separate 020 member-details dependency.
