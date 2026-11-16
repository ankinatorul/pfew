# Reusable trip sharing captures

Desktop and mobile screenshots use synthetic browser fixtures, public local CSS and in-memory operations. No live accounts, trip data or files are shown. Animation is settled before capture.

`owner-sharing`, `copied`, `copy-failed`, `people`, `editor-people`, `privacy`, `editor` and `unavailable` cover the shared drawer and People/file controls. `accepted` and `wrong-account` are retained historical invitation-component regression fixtures, not active reusable-join routes. New join routing/authentication/explicit acceptance is covered by `tests/reusable-trip-join.test.tsx` and isolated SQL tests.
