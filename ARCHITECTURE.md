# Architecture

Next.js server components/actions use a Supabase public client with the current user's cookie session. Zod validates external payloads and Supabase `getUser` verifies a Google-linked identity. No service-role key is used. Google OAuth exchanges PKCE codes through a same-origin callback; the request proxy refreshes cookies. Request-cached user verification is never shared across users.

Trips own dated segments and shared module preferences. Destinations are independent from stays/transport, linked by same-trip keys rather than assuming one hotel per destination. Dates/local times are explicit, and idea/planned/confirmed states never infer a booking. Atomic guided creation uses invoker-rights SQL. Date/link/ownership triggers constrain REST/RPC as well as application writes.

## Locations

A server-only bundled city dataset returns ranked city/country matches through a bounded public endpoint. Client forms submit opaque geographic IDs; server actions re-resolve those IDs and derive IANA zones instead of trusting posted time zones/coordinates. Independent departure/arrival locations allow multi-zone travel. Linked entries without an explicit city inherit their destination zone. Destination changes synchronize linked entries and the trip reference zone; unknown arrivals remain unknown. City centers are approximate and no venue coordinates are fabricated.

## Shared access

`owns_trip`, `can_read_trip` and `can_edit_trip` are narrowly scoped security-definer boolean helpers with fixed search paths, avoiding recursive RLS. Owner/editor/viewer access is enforced on every shared table. Trip metadata/membership/deletion stays owner-only, with a bounded RPC permitting shared budget edits. Record reassignment and ownership changes are forbidden. Invitations store random-token hashes, expire in seven days, bind to a verified auth email and accept atomically. No invitation messages are sent. Audit triggers store only actor/record/action/time and cannot be written by clients.

## Essentials and files

Bookings, Prep, Packing, allocations and optional expenses are separate shared records. Currency is stored per money record; projected remaining costs/prepaid inclusion and recorded actuals remain independent. Packing templates and profiles stay account-private.

`booking_attachments` and `booking-files` Storage objects are uploader-private, independent of shared-trip access. Canonical paths encode uploader/trip/booking/attachment IDs. New uploads first reserve pending metadata under a booking advisory lock (ten-document cap), then upload signature/MIME/size-validated bytes, then become ready only after object existence is confirmed. The metadata/object boundary uses explicit compensating cleanup; failures never claim completion. Revoked members retain management of their own files from their account. Objects must be deleted before metadata, and parent deletion guards prevent orphaning private files. Download endpoints issue short-lived signed URLs only after Google-authenticated private metadata access.

## Intelligence and discovery

Trip Check is deterministic over saved structured data, with stable evidence fingerprints, explicit uncertainty and persistent decisions. Runs retain timestamps even for zero findings. AI suggestions use a provider interface: explicit mock output or bounded official OpenAI requests with schema validation. Suggestions never mutate plans without approval; accepted suggestions become unscheduled ideas idempotently. Live output remains unverified; no external facts are silently assumed.

Google Places New is requested server-side with minimal masks and no response cache. Fresh data/attributions remain in client memory; only place IDs and user-authored labels/notes persist. Optional Maps JS shows real city centers or fresh place coordinates; lists remain available without keys. Service requests reserve an administrator-controlled estimated budget under a database advisory lock, before provider calls. Daily user counts and monthly aggregate estimates survive trip deletion; failures consume estimates. Browser map loads require separate Google billing controls. No private keys enter Next's public build configuration.

## Offline / PWA

The service worker caches a small public standalone reader only. It never caches SSR pages, APIs, private files or Maps; failed navigation can fall back to that reader. Explicit per-trip downloads fetch current RLS-authorized shared data and only selected uploader-private documents. Browser WebCrypto derives AES-256-GCM keys from an unsaved passphrase with PBKDF2-SHA256, random salt/IV and 210,000 iterations. IndexedDB stores encrypted envelopes, opaque identifiers and a refresh timestamp only. The standalone reader decrypts locally, renders text safely, locks on background and supports deletion. There is no offline write path or queue. Stored copies require refresh, may be evicted and cannot be erased by remote revocation.

## Reviewed imports and source research

Booking previews are stateless and private: the extraction endpoint verifies Google identity and edit permission, validates bounded input and returns only review fields/evidence. The raw source is never inserted into PostgreSQL or Storage. Labeled text parsing makes no external call; optional AI extraction requires consent and a reserved AI budget. PDF page/image-dimension inspection happens before provider dispatch. OpenAI Responses uses non-stored requests, generic filenames and strict output validation; text evidence is checked against the input. Approval reuses authoritative city-derived zone handling and writes through an invoker-rights idempotent RPC. Import keys prevent duplicate rows from repeated submissions. Existing manual booking writes remain available.

Research fetches have a fixed catalog of official HTTPS URLs, no user-provided targets, no redirects, an eight-second timeout and a 512 KB streaming bound. HTML is parsed server-side; only normalized plain text is returned. No automatic factual summarizer or eligibility engine is used. Context remains transient until explicit shared-note approval. Saving retrieves again and matches the exact normalized excerpt, then records authoritative catalog URL/name and retrieval/review times. Source retrievals reserve a zero-cost request against the existing daily quota. Research rows use shared read/editor write RLS and minimal auditing; destination/task links must remain within the same trip. A locked RPC creates at most one Prep task per note. Freshness warnings are contextual indicators, not verification guarantees.

## Everyday planning

Quick Add parses a fixed set of Google Maps HTTPS hosts/paths without fetching redirects or shortening services. Unverified link/query hints remain distinct from fresh optional provider lookups. Preview lives only in client memory; the save action validates trip/destination dates, derives zones on the server and inserts a user-scoped segment with a stable generated UUID. A duplicate-key retry succeeds only after finding that ID within the same accessible trip. Existing notes retain canonical Maps links, keeping the previous schema and offline behavior.

Day/time edits are limited to single-day activity/note records. Server actions derive linked destinations and time zones from scoped records, then condition the update on the timestamp submitted with the form. The one-row update preserves wallet records and marks moved confirmed plans as planned. Successful edits redirect to their day; failures preserve the form with an explanation. RLS remains the authorization boundary for all actions and direct API writes.

Saved schedule analysis uses Temporal with explicit rejection of ambiguous/nonexistent local times. Known activity durations and explicit transport/wallet endpoints become instants; exact linked duplicates are suppressed. Pairwise overlap checks have a bounded result set and stable evidence fingerprints, preserving Trip Check decisions until the underlying timing evidence changes. No route lookup, estimated travel time or external service is involved in analysis.

## Readiness and budget planning

Checklist starters derive optional packing/preparation candidates from structured trip context in memory. Preview/edit/selection does not persist data. Approved arrays are validated server-side, scoped to the target trip/list and deduplicated against existing normalized names, including completed/packed items. Namespaced stable UUIDs and `ON CONFLICT DO NOTHING` preserve existing edits and states during repeat requests. Each bulk insert is one PostgreSQL statement under existing editor RLS; no new tables or RPCs are needed.

Optional packing AI is an explicit authenticated endpoint: consent, configured key and a reserved AI budget precede the provider call. Its payload excludes personal names, references, original documents and existing item contents. Output is bounded/schema-validated with URL/citation rejection, stays unverified and goes through the same review flow. Free starters are deterministic checklists, not fake provider responses.

Budget distribution is pure arithmetic over a user-chosen amount, categories and weighted dates. BigInt cents and largest remainders preserve totals while skipping zero allocations. Server actions recompute rows, enforce currency/date bounds and compare a budget-context fingerprint before an idempotent bulk append. The fingerprint excludes the batch's own rows for retries, but does not lock out simultaneous independent plans. Existing amounts are never overwritten and research estimates remain null. Category visualization sums only planned amounts in the trip currency. All writes use the current user's public Supabase client and existing policies.
