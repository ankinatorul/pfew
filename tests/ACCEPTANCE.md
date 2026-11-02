# Live acceptance — not executed without Supabase

1. Apply both numbered migrations in order to a disposable Supabase project; configure Google OAuth and disable Email authentication.
2. Sign in using Google. Create a trip, sign out, sign back in; confirm persistence.
3. Create two destinations in the setup wizard, two stays within one destination and a transport leg. Confirm day ranges and local time zones.
4. Add flexible and timed activities, edit their dates to move days, reorder flexible items via order fields, delete with confirmation.
5. Hide/reorder/resize/highlight hub cards; refresh and verify saved preferences. Verify hidden modules remain available in navigation.
6. Sign in with a second account. Using both UI and the public Supabase REST client, attempt read/update/delete of first-account trip, segments, and preferences. Expect no accessible rows. Attempt inserting children under that trip; expect RLS rejection. Unauthenticated access must also fail.
7. Try reversed dates, negative budget, unknown time zone, out-of-trip item dates and shrinking a trip around existing items. Expect validation/constraint errors.
8. Test keyboard navigation and 375px/1440px widths. Test offline/network failures and cancelled OAuth flows. Confirm errors never report successful saves.

Automated local coverage additionally exercises transaction rollback on invalid destinations, same-trip destination links, multiple stays per destination, preserving stays on destination deletion, and form corrections. These tests do not substitute for Google OAuth or production Supabase authorization checks.

9. After Google sign-in, verify the header photo/name and menu email match the account. Open Your account and check the same identity. Use keyboard navigation and Escape with the menu. Sign out from the header: the photo must change to Sign in, protected pages must redirect to login, and signing back in must restore saved trip data. Check the initials fallback if the photo cannot load.
