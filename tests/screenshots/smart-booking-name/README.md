# Smart booking Name — local fixture captures

Real shared drawer components, mocked place responses and fictional isolated bookings. Fixture OSM identifiers are not claims about real provider records. Live coverage checks are recorded separately in `../../smart-booking-name-live-checks.json`.

| State                                       | Desktop                                                 | Mobile                                                |
| ------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Hotel suggestions inside Name               | [Desktop](desktop/hotel-suggestions.png)                | [Mobile](mobile/hotel-suggestions.png)                |
| Custom-name fallback, provider unavailable  | [Desktop](desktop/custom-name-provider-unavailable.png) | [Mobile](mobile/custom-name-provider-unavailable.png) |
| Attraction selected in existing-trip drawer | [Desktop](desktop/attraction-selected.png)              | [Mobile](mobile/attraction-selected.png)              |

Captured by the smart-name cases in `booking-collection.spec.tsx` and `booking-budget.spec.tsx`. The drawer, fixed footer and existing shell are reused. No live Supabase records or private documents appear in these captures.
