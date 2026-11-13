# Curated destination search screenshots

These use **mocked provider responses**, real Create Trip components and fictional trip details. They do not demonstrate live Photon availability or certify its current classifications.

| State                   | Desktop                                     | Mobile                                    |
| ----------------------- | ------------------------------------------- | ----------------------------------------- |
| Five suggestions        | [Desktop](desktop/five-suggestions.png)     | [Mobile](mobile/five-suggestions.png)     |
| Show more               | [Desktop](desktop/expanded-suggestions.png) | [Mobile](mobile/expanded-suggestions.png) |
| Rate limit              | [Desktop](desktop/rate-limit.png)           | [Mobile](mobile/rate-limit.png)           |
| Successful empty search | [Desktop](desktop/empty-search.png)         | [Mobile](mobile/empty-search.png)         |
| Provider unavailable    | [Desktop](desktop/provider-unavailable.png) | [Mobile](mobile/provider-unavailable.png) |

Captured by `tests/browser/trip-basics.spec.tsx`. Mobile popup placement respects available viewport space. Full-page captures show the existing fixed mobile navigation at its captured viewport position.
