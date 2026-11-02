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
