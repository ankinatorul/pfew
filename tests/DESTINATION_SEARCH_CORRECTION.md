# Destination search — clean but findable

Implemented locally on 12 November 2026. No live trip writes, database/schema changes, migrations, paid service, deployment, push or merge. Photon/OpenStreetMap remains the provider. Existing trips, drafts and their geographic IDs are not rewritten.

## Investigation and root cause

Confirmed implementation defects in the previous version:

1. Upstream layer restrictions excluded `house`/`street` responses before the app could interpret their geographic tags. The client then excluded every house/street classification, even where provider metadata identified a resort or administrative destination. A layer is not sufficient to decide whether a result is a usable travel destination.
2. Type ranking preceded name relevance. Administrative matches could be buried behind less relevant names. Existing nearby-point deduplication could also merge different types or identities without evidence of equivalence.
3. Provider errors became `worldwideAvailable: false` with an empty/local fallback, but the client could simultaneously display No matches and a second generic warning. This concealed provider unavailability. Successful old queries could be HTTP-cached for an hour, including filtered empty results.

**Observed live failure:** every attempted public Photon call timed out from this environment without receiving an HTTP response. This affects all eight requested destinations, not just Koh Lanta. Therefore the specific live cause of the owner's earlier Koh Lanta failure cannot be conclusively separated into provider coverage versus filtering from these attempts. The filtering/error-handling defects are confirmed from code and supplied-response regressions; a current successful Koh Lanta provider response was not obtained.

## Corrected behavior

- Broad Photon discovery uses only the entered query, English display language and a bounded 30-result request. No layer, country, bbox or geographic bias restriction. Names such as Koh Lanta are not hardcoded. A generic Ko/Koh spelling retry or comma-context relaxation is allowed once, only after a successful response lacks a usable close match. No query cascade follows a failed initial request.
- Name relevance comes first, followed by provider-supplied destination type, geographic context and actual metadata completeness/provider order. No confidence score is invented. Streets and ordinary address/building results are deprioritized/excluded in destination scope; actual resort/geographic/administrative tags take precedence over a coarse house layer. Administrative geography remains eligible. A house-layer administrative place is not falsely labelled Island.
- Initially at most five distinct presentation groups. Show more reveals the remaining bounded matches without another provider call. This presentation grouping does not merge or delete their geographic identities.
- Each suggestion has a name and a concise region/country line with type when supported by real tags. Same-label villages can use differing county context. City/island/district identities remain distinct. Repeated OSM objects or explicit shared Wikidata identities are deduplicated; different OSM objects are not merged just for nearby centroids. Anonymous features require matching name/type/context/point for deduplication. When different known types share an anonymous point ID, real type metadata qualifies the existing geographic ID format; no OSM ID or coordinate is invented.
- Presentation metadata is a separate response map; the selected `ResolvedLocation` shape, provider ID, encoded geographic point, coordinates and canonical draft resolution remain unchanged. Existing IDs still resolve. No migration is needed.
- One failure message and explicit Retry distinguish rate limits, outages and successful emptiness. Retry respects bounded cooldowns/Retry-After. The existing 400ms debounce, cancellation/IME support, per-picker success cache and result bound remain. The server coalesces identical pending requests, caches bounded successful results, limits concurrent searches to four per runtime and stops provider calls during cooldown. Shorter negative caching and a versioned client request avoid reusing old filtered responses.
- The popup includes the More action within its boundary; destination mode positions it above the input if necessary and caps it to the available mobile viewport. Keyboard selection/expansion, multiple ordered destinations and unobtrusive attribution remain. No coordinate control is exposed in the actual compact Create Trip form. Legacy non-compact map-entry callers retain their original behavior.

## Files changed

- `lib/worldwide-locations.ts`: broad requests, classification, name-first ranking, conservative deduplication, concise presentation metadata and bounded retry/cache/concurrency handling.
- `lib/location-search.ts`: five-suggestion presentation curation and request-version constant.
- `components/location-picker.tsx`: two-line results, More/Retry, accurate single-message states, cancellation-safe metadata/cache and viewport-aware destination popup.
- `app/api/locations/route.ts`: shorter success/empty HTTP cache lifetimes; failures stay no-store.
- `app/create-trip.css`: result typography and compact popup/More/Retry styles only.
- `tests/worldwide-locations.test.ts`: updated former restrictive contracts and added the requested destination, classification, identity, context, concurrency and failure regressions.
- `tests/browser/trip-basics.spec.tsx`: mocked curation, keyboard More, rate-limit Retry, empty/outage screenshots, multiple-destination reordering and stable draft recovery.
- This report, `tests/destination-search-live-checks.json` and screenshot gallery.

No draft, authentication, booking, theme, itinerary, budget or database implementation changed. The unrelated duplicate test file remains untouched. Temporary search-source checkpoint: `/private/tmp/pfew-destination-search-before/`.

## Verification

- `npm run lint` and `npm run typecheck`: **passed**.
- Full unit/database suite: **423 tests in 94 files passed**.
- Worldwide provider unit suite: **27 mocked cases passed**, including all eight named destinations, resorts, administrative house-layer matches, islands/villages, namesakes, city/island/district separation, OSM/Wikidata duplicates, county disambiguation, no synthetic island classification, bounded fallback, rate limits, concurrency, malformed responses and timeouts.
- Search/basics/Create Trip browser integration: **30 desktop/mobile cases passed**. The four new cases **passed again** after the final screenshot-spacing refinement.
- `npm run build`: **passed**.

The new browser cases verify that showing more makes no additional request, five suggestions stay clean, a rate limit does not claim No matches or auto-retry on cooldown expiry, retries recover, empty responses are distinct from outages, no nearby-town/coordinate instruction is shown in Create Trip, and multiple destinations preserve ordered geographic/provider IDs after save/resume. Retained suites cover debounce, Escape, late-response cancellation, required dates, cache and draft isolation. Writes are isolated fixtures/PGlite only.

## Non-destructive live checks

Initial diagnosis attempted the old layered request, an unrestricted Koh Lanta query and a Ko Lanta spelling variant. All timed out. A second bounded sequential pass checked:

| Query                | Result from this environment |
| -------------------- | ---------------------------- |
| Koh Lanta, Thailand  | Timeout; no HTTP response    |
| Ao Nang, Thailand    | Timeout; no HTTP response    |
| Bangkok, Thailand    | Timeout; no HTTP response    |
| Phuket, Thailand     | Timeout; no HTTP response    |
| Ubud, Indonesia      | Timeout; no HTTP response    |
| Positano, Italy      | Timeout; no HTTP response    |
| Santorini, Greece    | Timeout; no HTTP response    |
| Zermatt, Switzerland | Timeout; no HTTP response    |

The second pass used no automatic curl retries, 3s connection/6s total limits, two-second gaps, and would stop on HTTP 429. No rate-limit response was actually observed; automated 429 tests are mocks. Timestamp/status/error details are in [live-check log](destination-search-live-checks.json). Eleven public read-only attempts total across diagnosis and verification; no Supabase requests or user data involved.

Photon's [official API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md) describes layers, tags, IDs and built-in deduplication; its [public-server policy](https://github.com/komoot/photon#demo-server) allows moderate use but provides no availability guarantee. Current provider coverage and recovery remain unverified here; fixture screenshots are not evidence of live search success.

## Screenshots and limitations

See [desktop/mobile gallery](screenshots/destination-search-correction/README.md). Mocked provider responses, real Create Trip components and fictional trip details. No new images or unrelated UI redesign.

- The existing private-draft contract requires a resolved point/time zone. Free-text-only destinations cannot safely be finalized with the existing model. This pass preserves the actual entered query in browser recovery, offers Retry/spelling/country refinement, and does not force a nearby town, invent coordinates or add a non-persistent manual-success action. A true unresolved-destination workflow would need a separate approved contract change.
- Provider tags may be incomplete. Unknown types stay unlabelled; where no reliable extra context exists, the app cannot invent it. Presentation curation reduces repeated variants without erasing distinct identities.
- In-memory throttling/coalescing is per runtime, not a distributed global quota. Existing public-provider availability and its own throttling still apply. No new paid provider/key/billing is required for this correction.
- Live successful results could not be verified from this environment. Confirm a real Koh Lanta/Ao Nang response from the owner's normal browser/network when Photon is reachable. The code passes the supplied-usable-result acceptance cases, not a claim of universal provider coverage.

Stop after review. No push, merge, deployment or migration application was performed.
