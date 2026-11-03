# Pfew.

Responsive, mobile-first travel **web application**, deployed on Vercel at https://pfew.vercel.app. Next.js App Router, strict TypeScript, React, Tailwind, Radix, Supabase Auth/PostgreSQL/Storage. Google-only sign-in. No native app tooling or App Store workflow.

## Develop and verify

Node.js 22+ and npm: `npm ci`, then `npm run dev`. Public deployment defaults are in `config/public-deployment.json`; copy `.env.example` to ignored `.env.local` for another project or localhost OAuth. Only browser-public settings belong in the defaults. Never commit private API keys, service-role keys or deployment tokens.

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run test:e2e`. Browser tests use Chromium at mobile and desktop widths, covering the signed-out auth shell, city lookup, protected endpoints and encrypted offline reading. Use `npx playwright install chromium` if no system Chromium is available. They do not log in to Google. Local PostgreSQL tests exercise migrations/RLS independently of a live Supabase project. See `tests/PHASE34_ACCEPTANCE.md` for production acceptance checks.

## Database setup / upgrade

For a new Supabase project, run numbered migrations 001–010 in order. **For the existing Phase 2 deployment, run only [`supabase/upgrade_phase2_to_phase4.sql`](supabase/upgrade_phase2_to_phase4.sql)** in Supabase SQL Editor. It combines 005–009 in the correct order and preserves existing data; then apply migration 010. **If 001–009 are already applied, run only [`010_trip_onboarding.sql`](supabase/migrations/010_trip_onboarding.sql).** Do not rerun 001 or drop tables to fix duplicate-column errors. Upgrade instructions: [`supabase/UPGRADE.md`](supabase/UPGRADE.md).

The app uses the browser-publishable Supabase key and the signed-in user's cookies; RLS is the authorization boundary. No service-role key is used. SQL does not configure Google OAuth or external API credentials.

## Google authentication and account menu

Enable Google and disable Email/other unwanted providers in Supabase Auth. Create a **Web application** OAuth client in Google Cloud, with authorized redirect URI `https://saxraiqvelmeoeazaccd.supabase.co/auth/v1/callback`. Put that Google client ID (ending `.apps.googleusercontent.com`) and client secret in Supabase's Google provider settings.

Supabase URL Configuration: Site URL `https://pfew.vercel.app`; allowed Redirect URL `https://pfew.vercel.app/auth/callback`. For development also allow `http://localhost:3000/auth/callback`. The Supabase provider callback and the application's callback are different URLs. Start a fresh login after changing settings; do not replay an old code. Vercel builds reject localhost site overrides. A root `?code=` redirect is routed to the same-origin PKCE callback. Invitation returns use an allowlisted local path in a short-lived HttpOnly cookie, preventing open redirects.

The header displays the verified Google photo/name, with initials fallback. Its account menu shows email and Sign out. Signing out ends this device's Pfew session, clears authenticated layout caches, and keeps saved trip data and Google's browser session. `/api/auth/status` reads fresh public provider availability without revealing credentials; missing/unreachable settings remain unknown, not a false success.

## Automatic local time

Choose the destination **city and country** from location results. There is no time-zone input. The server resolves its ID against bundled geographic data and derives its IANA zone. Activities/stays/bookings inherit a linked or active destination; independently selected departure/arrival cities have independent zones. Linked plans without their own city follow destination-zone changes. Trip reference time follows the earliest destination. Before any destination is known, a new trip uses the browser's zone (UTC fallback); an unspecified arrival stays unspecified. Existing valid legacy zones are preserved until a location is resolved. See `THIRD_PARTY_NOTICES.md` for the finite city dataset and licensing.

## Trip modules

Bookings, Prep, Packing and Budget retain real Supabase persistence. Bookings are separate from itinerary plans. Planned remaining costs, prepaid amounts and actual manually recorded expenses are separate; currencies are never automatically converted. Packing templates remain account-private. Reminders are in-app only.

Trip Check inspects saved structured data: stay gaps, missing transport records, incomplete booking fields, possible stay overlaps and open preparation tasks. Each finding distinguishes saved evidence from uncertainty. Handled/snoozed decisions persist across reruns. It does not verify reservations or official entry requirements.

Ideas stay unscheduled until explicitly assigned a day/time/duration; approval creates an idea, never a confirmed reservation. AI has a server-side provider abstraction. Sample Mode is explicitly labeled and makes no paid calls. Live suggestions are conditional, unverified planning ideas, with budget/style context and strict response validation. No venues, prices or citations are invented by Sample Mode. Official-source research and reviewed booking imports are described below.

Map lists saved city centers and personal place notes without paid services. Optional Google Places supplies actual fresh results/details with attribution and retrieval time. Google place IDs and personal labels/notes may be saved; provider names/addresses/coordinates are transient rather than persisted or downloaded offline. Interactive Google Maps and Places require their respective configured keys; absent keys produce an honest list-only/unavailable state.

## Optional AI / Maps configuration and cost controls

Set server-only `AI_MODE=live`, `AI_API_KEY` and optionally `AI_MODEL` (default `gpt-4.1-mini`) in Vercel. Set server-only `GOOGLE_PLACES_API_KEY` for Places API (New). Restrict this key to that API; a separate browser `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` must be restricted to Maps JavaScript API and your exact HTTPS referrers. Browser keys are public by design; server secrets must never use a `NEXT_PUBLIC_` prefix. Redeploy after changing build-time browser variables. AI and Places calls go to official provider endpoints only. Actual keys and live provider calls are not supplied by this repository.

Database reservations serialize request-budget checks: default $5/month in estimated service cost and 30 requests/user/UTC day. Fixed AI/Places request estimates are 5 cents; failed requests still count and mock calls consume only the daily count. Only an administrator can change `service_budget_settings`. These estimates are **not provider invoices or guaranteed billing caps**. Configure provider-side billing/quota controls separately, especially for browser map loads (outside the server reservation budget). No external call runs automatically on each render.

## Collaboration and private documents

Owners manage settings, membership and deletion. Editors change shared trip content and budget; viewers read shared data and cannot mutate it through UI, REST or RPC. Owners create seven-day invitation links for a specific verified Google email. The database stores only a token hash; links are copied manually, never emailed automatically. A minimal audit trail records actor/record/action/time, without filenames, references, note bodies or file content.

Booking uploads remain private to **their uploader**, including from the trip owner and other editors. PDF/PNG/JPEG up to 3 MB each; a database lock enforces ten documents per booking. Uploads reserve pending metadata, validate MIME/signature, upload, then become ready. Incomplete records remain removable. Downloads require Google authentication and owner-scoped metadata, then receive 60-second signed links. This POC has no malware scanner.

Uploaders can manage files from Your account even after losing trip access. Supported deletion removes objects before metadata; database guards reject booking/trip deletion while private files remain, preventing destructive cascades from stranding documents. A user who directly uploads an object and deletes their account administratively still needs appropriate administrator Storage cleanup. Do not make the bucket public or put personal identity documents in shared notes. Removing access does not erase previously downloaded copies.

## Deliberate offline reading / PWA

Open a trip → **Offline** to explicitly download/refresh a read-only copy. Choose a separate 10+ character passphrase and optionally up to three private documents. The browser encrypts trip data and documents using PBKDF2-SHA256 (210,000 iterations, random salt) and AES-256-GCM (random IV), then writes only ciphertext, opaque IDs and a refresh timestamp to IndexedDB. Passphrases are not saved or sent to the server and cannot be recovered.

`/offline.html` unlocks the copy without a network/auth request, shows its download time, and supports locking/removing it. It locks when backgrounded. Signing out retains encrypted copies until removed explicitly. Service-worker cache contains only public reader assets; authenticated pages, APIs, documents and Google Maps responses are never cached. No offline edits or mutation queue exist. Offline copies are stale until refreshed; revocation cannot erase them; browser storage may be evicted. They are not backups. Optional installation is through the browser's PWA controls, with no native deployment.

## Vercel deployment and diagnostics

Import `ankinatorul/pfew`, production branch `main`, framework Next.js, root repository directory. `vercel.json` selects the npm install/build commands. **Leave Output Directory override disabled.** Public Supabase/site defaults work when variables are missing/blank; explicit environment overrides take precedence. Keep the exact production Supabase callback allowlist.

`/api/health` reports `release: "phase-4"`, deployment commit when Vercel supplies it, module names and effective public-configuration presence. It never reports credentials/user data and uses no-store. It is **not** proof of applied SQL, authentication, Storage or paid-provider readiness. Check Vercel deployment logs and run the live acceptance list. Automated local checks cannot establish a successful production deployment.

## Reviewed booking imports and official-source research

From **Smart Add** or **Bookings**, choose **Import a booking confirmation**. Pasted labeled text works without a paid key. Only explicit unambiguous fields are extracted; dates must be ISO and money must use a decimal point. A private, temporary preview shows extracted values, source evidence and unknowns. Unknown dates/currency are blank, with no trip-date or currency fallback. Review/correct the form and explicitly approve the shared booking. Repeated submission of the same preview creates one booking through an atomic RPC. The import does not create an itinerary reservation or save the original source document.

Optional AI reading uses the existing server-only AI configuration and the OpenAI Responses API with `store: false`, an output limit and a 25-second timeout. Each request requires explicit consent before sending source data. It accepts pasted text or one PDF/PNG/JPEG up to 3 MB; PDFs must be readable, unencrypted and at most five pages, images at most 20 megapixels. Filenames are not sent to the provider. Text extraction mechanically checks quoted evidence; image/PDF output remains unverified until human review. Missing consent, absent keys or invalid files consume no provider reservation; started/failed provider calls consume the existing estimate. Provider retention policies still apply. Passport numbers, card details and unrelated private data should be removed before processing. Attach originals separately using the existing uploader-private document flow when needed.

The trip's **Research** tab offers a fixed catalog of official destination portals and UK FCDO entry-guidance pages for selected countries. It asks for nationality, document type, purpose and travel dates; these inputs are not sent to source websites. FCDO advice is labeled as primarily for British nationals. Unsupported countries get an honest unavailable state. Fetches occur only on request, target fixed HTTPS URLs, reject redirects, cap response size at 512 KB and time out after eight seconds. Scripts/navigation are removed and content is rendered as plain text. Interactive/blocked/unreadable sites can still be opened directly; no guidance is generated to replace a failed source.

Select a passage, add a title/note and approve sharing the excerpt and context. Saving re-fetches the source and requires the quote to match the current text. Retrieval/review timestamps describe the source check, not eligibility verification. Notes warn after 30 days or when the researched travel period no longer fits the trip dates. An explicit action adds one linked Prep task per source note. Free source requests consume the daily allowance but no estimated paid cost. No AI visa ruling, mandatory task or invented citation is created. Research needs connectivity; approved task titles appear in the existing offline checklist.

These features require **migration 009**. If 005–008 are already applied, run only `supabase/migrations/009_research_and_booking_imports.sql`; otherwise the combined upgrade now includes 005–009. Health reports required schema version 9, without checking the live database. See `tests/RESEARCH_IMPORT_ACCEPTANCE.md`.

## Quick Add and everyday planning

Open **Smart Add** and enter a name, address, note or supported HTTPS Google Maps link. Preview privately, provide your own label, optionally reuse the input as an address, and explicitly choose an unscheduled Idea or planned day. No item is saved by previewing. Short Maps links are retained without expansion; place data is not guessed. Supported full links may supply a place identifier, labeled as unverified until lookup. A generated item ID makes a repeated save idempotent, using the existing segment table rather than a new schema.

With a configured Google Places key, an explicit lookup can search by your label or preview a place ID through the official API. It reserves the existing Places request budget and shows fresh provider attribution. Saving retains the ID, your own label/address/notes and a canonical Google Maps link; provider coordinates, names and addresses are not automatically persisted. Maps links in itinerary/Idea notes open safely, while unsupported hosts and schemes are not linkified. Previewing or saving a manually entered item makes no paid request.

On an itinerary activity or note, open **Change day / time**. Single-day records move through a conditional one-row update using the version shown when the form opened; stale edits produce an error instead of overwriting another change. Local time zones follow the item's explicitly resolved city, or its destination on the new day. Changing the date/time of a confirmed item marks the revised item Planned. Its linked booking keeps its own saved dates; actual reservation changes must be made with the provider. Stays, transport and multi-day records use the detailed form. Success opens the destination day.

The daily overview and Trip Check compare saved times using IANA rules, including cross-zone and midnight overlaps. Only known durations or explicit end times are used; stays, notes and unscheduled Ideas do not block time. Identical linked wallet/itinerary intervals are counted once. Ambiguous/nonexistent DST times and impossible end-before-start records are flagged for review; no UTC offset is guessed. Overlap can be intentional for different travelers, and no travel time, provider availability or reservation validity is inferred. Linked date differences are observations, not automatic corrections.

This release uses **schema version 9**, already covered by the previous upgrade; there is no new SQL step. See `tests/PLANNING_ACCEPTANCE.md` for remaining live checks.

## Reviewed readiness checklists and budget distribution

In **Packing**, open **Build a reviewed packing checklist** on a list. Choose clothing days based on your own laundry/luggage plans, preview suggestions, edit names/categories/quantities, uncheck anything irrelevant and explicitly approve the additions. The checklist starter works without a paid call. Optional live AI uses the existing server AI configuration, requests consent and sends only trip duration, destination labels, transport types and clothing preferences. Personal names, booking references and existing packing-item names are excluded from the provider payload. AI output remains unverified; no weather, baggage, medical or entry facts are inferred.

In **Prep**, choose **Review suggested preparation tasks**. The starter uses saved context, keeps proposed due dates blank and lets you choose/edit tasks before approval. No task is deemed mandatory automatically. Existing names, including packed/completed items, are skipped. Server-generated stable addition IDs plus conflict-ignore bulk insertion make repeat requests safe without resetting existing states. A single bulk statement adds each reviewed group; invalid rows fail the statement rather than leaving half a group. Existing templates/manual editing remain available.

In **Budget**, choose **Distribute an amount across days and categories**. Start from the unallocated target or enter an amount in the trip currency; adjust category percentages, date range (up to 60 days per batch) and day weights. Preview exact per-day/category amounts, then approve new allocations. The starting split is an editable planning preference, not researched local pricing. A largest-remainder calculation in integer cents preserves the chosen total exactly. Zero-weight days/categories are skipped, and zero-cent rows are omitted. Existing prepaid inclusion and actual-expense accounting remain separate. A category breakdown displays only planned allocations in the selected currency.

Approved batches use stable IDs per preview and append allocations without overwriting current rows or setting researched estimate ranges. The server checks the trip currency, date bounds and a fingerprint of existing budget context before saving, with retry handling for its own inserted batch. This detects ordinary stale previews; it is not a database lock on the entire trip budget, and simultaneous plans can legitimately put the preference target over allocation. Review the refreshed target totals. The planner is not a provider billing cap or automatic spending decision. Existing allocations can be edited/removed normally.

All additions require online connectivity, Google sign-in and editor/owner rights under existing RLS. There is no mutation queue. This release needs no new SQL or keys for checklist starters and budget arithmetic. See `tests/READINESS_BUDGET_ACCEPTANCE.md` for live checks still pending.

## Adaptive Home and trip navigation

Home now uses real saved records to show preparation/packing progress, near-term dated tasks, visible findings from the last manual Trip Check and a budget overview with planned/prepaid/actual amounts kept distinct. Handled findings stay hidden; the check's timestamp is shown and no automatic provider research runs. During travel it highlights the local date for the latest applicable saved destination, today's activities and the next saved timed event. Known ongoing time windows can be shown; already departed events with no known ongoing window are excluded. Unspecified or ambiguous start times stay labeled for review instead of receiving a guessed instant. Exact linked wallet/itinerary starts are not repeated. Seven-day task windows use local calendar dates across DST changes.

The dashboard is a dated snapshot from saved plans, not live provider tracking or a location sensor. Refresh it explicitly to load changes. Destination selection comes from saved date ranges, with the trip reference zone as fallback. Explore opens Map with a contextual search query; it makes no Places request until the user searches. Past-trip snapshots retain itinerary and budget access without upcoming-event/reminder panels. Snapshot data does not include private attachment metadata or file contents.

Search/filter your accessible trips by name, lifecycle and owned/shared access. Current trips sort first, then upcoming starts, then recent past trips. **Show on Home** or the trip selector can display another accessible trip, including an archived one. Selection and filters are views only; they do not change trip records or hide modules permanently.

Trip navigation keeps common sections at hand on mobile (Trip, Days, Wallet, Map) with remaining sections in **More**. Desktop shows the full section links with wrapping. The selected itinerary day is retained through section navigation, and Settings remains owner-only. The browser suite checks the real navigation markup with the production stylesheet at mobile/desktop sizes using synthetic IDs, separately from the signed-out auth checks; it does not simulate a live Google session. No SQL or new API keys are required for this release.

## Signed-in setup checks and launch verification

Open **Your account → Check app setup**, or `/profile/checks`, after signing in with Google. Click **Run read checks**. This uses your session and the ordinary public Supabase client, not an administrator/service-role key. No new SQL migration is required. The copyable report excludes account emails, record contents, trip IDs/names, file paths, signed URLs and keys.

The checker requests zero rows from 23 expected table/column combinations and reads `service_budget_status()` without reserving a request. Missing tables/fields are setup issues; denied/failed reads remain unknown. Passed reads establish neither complete migration application nor writes, triggers or cross-account privacy. The current Google session and provider settings are checked separately; the configured callback origin still needs a fresh OAuth round trip. Optional AI/Places/Maps states describe configuration presence only and make no paid calls. The page contains step-by-step optional key configuration instructions.

The document checkbox is optional and off by default. It selects at most one ready upload owned by the current user, requests a short-lived signed URL, then tests the same object's unsigned public URL without cookies, keys or authorization. Requests ask for one byte and cancel the response body; contents are not returned or saved. An unsigned denial passes this single-file sample only after a successful signed read confirms the object exists. Missing/unreadable files remain unknown; an unsigned success needs setup. This does not inspect administrator bucket configuration or other users' storage policies.

Finish with real save/reload, two-account invitation/role/document and offline-unlock checks in [the launch acceptance guide](tests/SETUP_CHECK_ACCEPTANCE.md). This workspace cannot directly verify the live deployment under its current network policy, or borrow your private Google session. Running the check from your browser provides an account-scoped report that can be copied back for diagnosis. The public `/api/health` endpoint retains its narrower release/configuration-only scope.

## Combined trip Map and location list

A trip's **Map** now brings destinations, stays, activities/notes, unscheduled ideas, booking locations and saved places into one list. Transportation departure/arrival points use their own saved dates. Type/day filters apply to both that list and map markers; the day filter has an explicit option to include undated ideas/places. A saved-place category filter only narrows saved places, leaving other trip records intact. Fresh search results stay separate from these filters and are never silently saved.

City points are **approximate centers**, not hotel entrances, terminals or verified activity locations. Items without usable coordinates remain in the list without a guessed pin. A stored Google place ID can open its external Maps link without an API key; Editors/Owners can deliberately request fresh venue details when Places is configured. Provider coordinates/details remain transient, with attribution and retrieval time. Opening the page or changing filters makes no Places/AI request. Interactive map loading still requires the optional browser Maps key and its provider billing controls.

Selecting a pin highlights and focuses the corresponding card; selecting a listed point highlights it on the map. Booking/day/Ideas links preserve the record's context. The map's booking query is trip-scoped under RLS and only selects shared location/display fields—no references, traveler names, notes, prices or attachment metadata. No SQL changes are required. See [Map acceptance](tests/MAP_ACCEPTANCE.md) and [the remaining two finishing milestones](ROADMAP.md#completion-status-and-finish-line).

## Journey Overview visual review

Open a trip → **Journey** (`?view=destinations`) for the first increment of the visual reset: colored destination chapters, readable dates/calendar nights, saved summaries, transport connections and contextual Trip Check/Ideas. Secondary edit/move/delete actions use a three-dot menu. Existing Supabase data and actions remain connected; no SQL or keys are needed. The daily list excludes destination periods as duplicate activities, but other screen redesigns are deferred pending approval. See [the visual system](DESIGN_SYSTEM.md) and [review steps](tests/JOURNEY_DESIGN_ACCEPTANCE.md). The supplied design brief did not include its referenced screenshots, so exact reference matching remains pending.

## New-trip onboarding

Existing website styles and shared design tokens guide the five-step `/trips/new` flow: basics, multiple booking sources/manual destinations, explicit review, preferences and the real workspace handoff. Flight-only and empty trips are valid. Extraction review and reservation confirmation are separate, while incomplete imports remain owner-private drafts. **Existing projects need migration 010**; live AI additionally needs the existing server AI configuration. See [onboarding design/setup](ONBOARDING.md) and [acceptance checks](tests/ONBOARDING_ACCEPTANCE.md). Existing trip settings and unrelated modules retain their flows.

Onboarding adapts across phone, tablet and desktop widths. Desktop uses a step rail and live trip summary alongside a wide form, with parallel upload/manual options; phones use the full content width and a compact step indicator. The shared website header/account navigation stays available, with no outer artboard or fixed-height mockup. Preferred travel pace is saved with the existing private setup preferences. The responsive refinement requires no SQL beyond the already applied migration 010.
