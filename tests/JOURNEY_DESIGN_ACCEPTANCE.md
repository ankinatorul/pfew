# Journey Overview design acceptance

This release implements only the Journey Overview visual reset. The written brief was supplied without its referenced screenshots; exact visual matching is therefore unverified and visual approval remains pending.

1. Open an existing trip → Journey. Confirm destination names and human-readable dates/night counts lead, with distinct lavender/lime/pink cards and transport connection rows. There should be no CRUD-style Edit/Delete action bars on cards.
2. Compare stay/activity/idea summaries with saved records. Explicit destination links and city/date matches supply context; ambiguous records are not guessed. Unscheduled ideas cannot be assigned by placeholder date. Linked bookings do not duplicate their itinerary records.
3. Verify a saved transport booking appears as a connection without requiring an itinerary duplicate. Check unverified/user-confirmed booking labels, local saved times, uncertainty for date-linked routes, and links to the right wallet/form. Unmatched journeys remain accessible; absent transport is not a claim that no arrangements exist.
4. Open a destination's three-dot menu by touch and keyboard. Edit and Change dates/move use the existing form. Cancel deletion: nothing changes. Confirm deletion on a disposable test destination: existing server/RLS checks apply. Viewers have no mutation menu; offline edits are disabled. Other forms/actions are unchanged.
5. Trip Check shows saved findings with handled/snoozed decisions respected, or an honest unchecked state. It does not automatically run when viewing Journey. Owners/Editors can deliberately refresh using the existing action; Viewers can read the check. No provider call occurs from rendering the overview.
6. Open Day Itinerary: long-running destination periods no longer appear as daily activities. Its visual redesign is deferred. All existing modules and customizable Hub remain reachable.
7. At 375px, verify full-width destination cards, 44px menu targets, compact navigation and no horizontal overflow. At 1440px, verify intentional story/insight columns. Test long custom names, same-day stops and an empty trip.
8. Review `test-results/journey-mobile.png` and `journey-desktop.png`. These use production components/CSS and illustrative fixtures, not a production session. The user must approve this direction before subsequent module redesigns.

No database migration or new credentials are required. Automated tests and fixture screenshots do not establish live Google/Supabase authorization or reference-image fidelity.
