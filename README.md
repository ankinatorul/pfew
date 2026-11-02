# Pfew.

Responsive, mobile-first travel **web application**, deployed on Vercel at https://pfew.vercel.app. Next.js App Router, strict TypeScript, React, Tailwind, Radix, Supabase Auth/PostgreSQL/Storage. Google-only sign-in. No native app tooling or App Store workflow.

## Develop and verify

Node.js 22+ and npm: `npm ci`, then `npm run dev`. Public deployment defaults are in `config/public-deployment.json`; copy `.env.example` to ignored `.env.local` for another project or localhost OAuth. Only browser-public settings belong in the defaults. Never commit private API keys, service-role keys or deployment tokens.

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run test:e2e`. Browser tests use Chromium at mobile and desktop widths, covering the signed-out auth shell, city lookup, protected endpoints and encrypted offline reading. Use `npx playwright install chromium` if no system Chromium is available. They do not log in to Google. Local PostgreSQL tests exercise migrations/RLS independently of a live Supabase project. See `tests/PHASE34_ACCEPTANCE.md` for production acceptance checks.

## Database setup / upgrade

For a new Supabase project, run numbered migrations 001–008 in order. **For the existing Phase 2 deployment, run only [`supabase/upgrade_phase2_to_phase4.sql`](supabase/upgrade_phase2_to_phase4.sql)** in Supabase SQL Editor. It combines 005–008 in the correct order and preserves existing data. Do not rerun 001 or drop tables to fix duplicate-column errors. Upgrade instructions: [`supabase/UPGRADE.md`](supabase/UPGRADE.md).

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

Ideas stay unscheduled until explicitly assigned a day/time/duration; approval creates an idea, never a confirmed reservation. AI has a server-side provider abstraction. Sample Mode is explicitly labeled and makes no paid calls. Live suggestions are conditional, unverified planning ideas, with budget/style context and strict response validation. No venues, prices or citations are invented by Sample Mode. Official-source research and optional booking-document AI extraction are not implemented.

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
