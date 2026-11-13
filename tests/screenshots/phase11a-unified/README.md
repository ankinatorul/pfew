# Shared bookings — desktop and mobile

Captured locally on 13 November 2026 using the real components with fictional, isolated browser fixtures. No live bookings, private originals or paid extraction results appear here.

| View                                | Desktop                                            | Mobile                                           |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Create Trip → Add Bookings          | [Desktop](desktop/create-trip-add-bookings.png)    | [Mobile](mobile/create-trip-add-bookings.png)    |
| Existing trip → Bookings            | [Desktop](desktop/bookings.png)                    | [Mobile](mobile/bookings.png)                    |
| Stay drawer from existing trip      | [Desktop](desktop/stay-drawer.png)                 | [Mobile](mobile/stay-drawer.png)                 |
| Transport drawer from existing trip | [Desktop](desktop/transport-drawer.png)            | [Mobile](mobile/transport-drawer.png)            |
| Uploaded confirmation review        | [Desktop](desktop/booking-review.png)              | [Mobile](mobile/booking-review.png)              |
| Saved booking cards                 | [Desktop](desktop/saved-cards.png)                 | [Mobile](mobile/saved-cards.png)                 |
| Create Trip uploaded review         | [Desktop](desktop/create-trip-uploaded-review.png) | [Mobile](mobile/create-trip-uploaded-review.png) |
| Create Trip saved cards             | [Desktop](desktop/create-trip-saved-cards.png)     | [Mobile](mobile/create-trip-saved-cards.png)     |
| Read-only booking details           | [Desktop](desktop/booking-details.png)             | [Mobile](mobile/booking-details.png)             |
| Empty existing trip                 | [Desktop](desktop/bookings-empty.png)              | [Mobile](mobile/bookings-empty.png)              |

Compare the first two rows for the same upload/manual options. Both flows use the same drawer, type/payment pills, contextual fields and compact cards; their page headings and persistence context differ. Existing trips retain their previously approved summaries and filters. The Stay/Transport screenshots deliberately change a fictional legacy activity's type without saving, to exercise contextual fields and cancellation.

The gallery also includes Budget and expense captures from existing regression scenarios; those screens were not redesigned. Captures come from `booking-budget.spec.tsx` and `trip-review.spec.tsx`. Previously approved screenshot files are restored after capture to avoid overwriting their baselines.
