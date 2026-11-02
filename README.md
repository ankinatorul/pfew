# Pfew.

Mobile-first responsive travel web application. Next.js App Router, strict TypeScript, Tailwind, Radix-based UI, Supabase Auth and PostgreSQL. Deploy to Vercel; no native application tooling.

## Local development

Requires Node.js 22+ and npm. Run `npm ci`, then `npm run dev`. This checkout includes public deployment defaults for Pfew’s Supabase project. To use another project or a local authentication callback, copy `.env.example` to ignored `.env.local` and enter overrides. No authenticated sessions or trip data are simulated.

## Supabase setup

Create a Supabase project. Execute `supabase/migrations/001_foundation.sql` followed by `supabase/migrations/002_guided_destinations.sql` in SQL Editor (once each, in order). If the first migration is already applied, run only the second. Migration `002` is safe to rerun when its column or other migration objects already exist; it preserves saved trip data. Do not rerun `001` or drop tables to recover from duplicate-object errors. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from project API settings. Never use a service-role key. Set `NEXT_PUBLIC_SITE_URL` to the application's canonical origin.

Enable Google as the only sign-in provider and disable Email in Supabase Authentication. Configure Google OAuth credentials in Supabase, using the Supabase provider callback URL in Google Cloud. In Supabase URL Configuration, set Site URL and allow `http://localhost:3000/auth/callback` for development plus the production callback. No email magic links or passwords are implemented in this app.

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. `npm run test:e2e` checks the configured authentication shell and release endpoint at mobile and desktop widths against a production build. It uses system Chromium when available; otherwise run `npx playwright install chromium` first. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an installed browser. Domain and embedded PostgreSQL migration/RLS tests are self-contained. Live authentication, persistence, and cross-account RLS acceptance checks require a configured Supabase project; see `tests/ACCEPTANCE.md`.

## Vercel

Import this Git repository into Vercel, select Next.js, use the repository root and `npm run build`. The public defaults target `https://pfew.vercel.app`; use the three variables in `.env.example` to override them for another deployment. Set the Supabase callback allowlist to the exact deployed domain before testing login. Avoid broad OAuth redirect wildcards for arbitrary previews.

Phases 1–2 do not call paid AI/Maps services, use email inboxes, or implement offline caching. Browser PWA installation is a later optional enhancement. See ROADMAP.md for remaining scope.

## Phase 2 rollout

For a project with migrations 001 and 002 already applied, run `003_travel_essentials.sql` followed by `004_private_booking_files.sql` in Supabase SQL Editor. Do not rerun 001. The new migrations can be rerun after successful application; existing data is preserved. Migration 004 requires Supabase Storage's existing `storage` schema and creates a private `booking-files` bucket and owner-scoped object policies. Do not make this bucket public.

Bookings, Prep, Packing and Budget are available from each trip's navigation and customizable Hub. Existing trips remain usable before the migrations; new modules show a setup state until their tables exist. The Home view surfaces due custom Prep tasks, saved bookings and today's itinerary while traveling.

Upload PDF, PNG or JPEG files up to 3 MB each (up to 10 files per booking through the UI). Server actions allow 4 MB request bodies to accommodate upload overhead. Downloads require authentication and use 60-second signed links with download disposition. File uploads are private to the trip owner. The app removes stored files before deleting a booking or trip; deleting rows manually in SQL/REST can leave inaccessible storage objects requiring administrator cleanup. This POC checks file signatures but does not provide a malware scanning service.

Budget allocations describe remaining costs; keep prepaid amounts out of them. The inclusion rule controls whether recorded prepaid booking amounts count against the trip target. Expenses remain a separate actual-spending record, and all currencies are kept separate. Allocation currencies are stored explicitly so changing the trip's display currency cannot reinterpret older amounts. Cost ranges are manually entered assumptions, not researched estimates. Packing templates are account-private, and applying one explicitly adds unpacked copies of its items.

`npm run test:e2e:auth` tests the configured login/protected shell at mobile and desktop widths; it does not sign in or send emails. The production build and Supabase URL/publishable key must be configured first. See `tests/PHASE2_ACCEPTANCE.md` for the live acceptance checks still required. For production at `https://pfew.vercel.app`, set `NEXT_PUBLIC_SITE_URL` to that origin in Vercel and allow `https://pfew.vercel.app/auth/callback` in Supabase.

## Deployment troubleshooting

The repository's `vercel.json` explicitly selects Next.js and the tested npm install/build commands. Leave Vercel's Output Directory override disabled. After a successful production deployment, `/api/health` reports `release: "phase-2"`, Vercel's Git commit SHA when provided, and effective public configuration-presence booleans. This endpoint exposes no credential values or user data and disables caching. It does not verify authentication, migrations or Storage. If the endpoint is missing or reports an older release, the production domain is not serving this version. Confirm the Vercel project is connected to `ankinatorul/pfew` with production branch `main`, and inspect its latest deployment logs.

Bookings, Prep, Packing and Budget are available inside each trip and through Home shortcuts when a current/upcoming trip exists. The sign-in screen remains shared across releases.

## Public deployment defaults

`config/public-deployment.json` contains this Pfew deployment's Supabase project URL, browser-publishable key and canonical site URL. These values are public browser configuration, not privileged credentials. Next.js supplies them at build time when Vercel variables are missing or blank; existing `NEXT_PUBLIC_*` environment values take precedence. This avoids requiring dashboard access to configure this deployment. Never add service-role keys, Vercel tokens, AI keys or other private credentials to this file or Next.js `env` configuration.

A build using the defaults serves sign-in rather than the setup screen. `npm run test:e2e` and `npm run test:e2e:auth` now both test the configured authentication shell. `tests/browser/setup.spec.ts` is retained for deployments that intentionally remove these defaults; it is not selected by the default browser test configuration. The health endpoint reports effective build configuration, including these defaults, rather than proving the variables were entered in Vercel's dashboard. Real sign-in, redirects, database and Storage still require functional verification.

## Authentication provider availability

The login screen offers Google only and checks Supabase Auth's public `/auth/v1/settings` endpoint on the server, with a five-second timeout and no caching. The Google button is enabled only when Supabase enables Google. Disabled or unreachable provider settings show a meaningful explanation and retry. The Google server action rechecks availability before initiating OAuth. Email sign-in has no form or server action. Protected loaders, mutations, auth callback and document downloads require a Google-linked identity. Supabase itself must have Email and other unwanted providers disabled to restrict authentication through its API; the app's publishable key cannot change project Auth configuration.

For Google at this deployment, configure a Web OAuth client in Google Cloud with redirect URI `https://saxraiqvelmeoeazaccd.supabase.co/auth/v1/callback`, enter its client ID and client secret in Supabase Authentication's Google provider settings, and enable the provider. The application's callback `https://pfew.vercel.app/auth/callback` belongs in Supabase URL Configuration's allowed redirects. Provider enablement is managed through Supabase Authentication settings and requires the project administrator's access; SQL migrations do not supply Google OAuth credentials.

For Google login diagnostics, `/api/auth/status` makes a fresh read-only request to Supabase and returns the effective project hostname, enabled/disabled/unknown Google state, HTTP status and a non-sensitive error category. It never returns keys, client secrets, provider configuration contents or user data. An omitted Google flag is unknown rather than disabled.

## OAuth redirect to localhost

In Supabase Authentication → URL Configuration, production Site URL must be `https://pfew.vercel.app` and allowed Redirect URLs must include `https://pfew.vercel.app/auth/callback`. Supabase falls back to its Site URL when the requested redirect is not allowed. On Vercel, the build rejects localhost, invalid and non-HTTPS site overrides in favor of the production default. Local development can still use localhost. If Supabase returns a valid authorization code to the application's root Site URL, the request proxy routes it to the same-origin callback before rendering for PKCE exchange; it never follows a user-provided destination. Start a fresh sign-in after correcting settings rather than replaying an old authorization code.
