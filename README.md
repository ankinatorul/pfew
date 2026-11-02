# Pfew.

Mobile-first responsive travel web application. Next.js App Router, strict TypeScript, Tailwind, Radix-based UI, Supabase Auth and PostgreSQL. Deploy to Vercel; no native application tooling.

## Local development

Requires Node.js 22+ and npm. Run `npm ci`, copy `.env.example` to `.env.local`, then `npm run dev`. Open the local server in your browser. Without configuration, an explicit setup screen is displayed; it is not a simulated authenticated app.

## Supabase setup

Create a Supabase project. Execute `supabase/migrations/001_foundation.sql` followed by `supabase/migrations/002_guided_destinations.sql` in SQL Editor (once each, in order). If the first migration is already applied, run only the second. Migration `002` is safe to rerun when its column or other migration objects already exist; it preserves saved trip data. Do not rerun `001` or drop tables to recover from duplicate-object errors. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from project API settings. Never use a service-role key. Set `NEXT_PUBLIC_SITE_URL` to the application's canonical origin.

Enable email magic links in Authentication providers. Configure Google OAuth credentials in Supabase, using the Supabase provider callback URL in Google Cloud. In Supabase URL Configuration, set Site URL and allow `http://localhost:3000/auth/callback` for development plus the production callback. Use a custom SMTP provider for production delivery. No passwords are implemented.

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. `npm run test:e2e` runs the unconfigured setup flow at mobile and desktop widths against a production build; run it without Supabase environment variables or `.env.local`. It uses system Chromium when available; otherwise run `npx playwright install chromium` first. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an installed browser. Domain and embedded PostgreSQL migration/RLS tests are self-contained. Live authentication, persistence, and cross-account RLS acceptance checks require a configured Supabase project; see `tests/ACCEPTANCE.md`.

## Vercel

Import this Git repository into Vercel, select Next.js, use the repository root, and add the three variables in `.env.example`. Use `npm run build`. Set the production site URL and Supabase callback allowlist to the Vercel/custom domain before testing login. No deployment has been performed by this implementation. Avoid broad OAuth redirect wildcards for arbitrary previews.

Phases 1–2 do not call paid AI/Maps services, use email inboxes, or implement offline caching. Browser PWA installation is a later optional enhancement. See ROADMAP.md for remaining scope.

## Phase 2 rollout

For a project with migrations 001 and 002 already applied, run `003_travel_essentials.sql` followed by `004_private_booking_files.sql` in Supabase SQL Editor. Do not rerun 001. The new migrations can be rerun after successful application; existing data is preserved. Migration 004 requires Supabase Storage's existing `storage` schema and creates a private `booking-files` bucket and owner-scoped object policies. Do not make this bucket public.

Bookings, Prep, Packing and Budget are available from each trip's navigation and customizable Hub. Existing trips remain usable before the migrations; new modules show a setup state until their tables exist. The Home view surfaces due custom Prep tasks, saved bookings and today's itinerary while traveling.

Upload PDF, PNG or JPEG files up to 3 MB each (up to 10 files per booking through the UI). Server actions allow 4 MB request bodies to accommodate upload overhead. Downloads require authentication and use 60-second signed links with download disposition. File uploads are private to the trip owner. The app removes stored files before deleting a booking or trip; deleting rows manually in SQL/REST can leave inaccessible storage objects requiring administrator cleanup. This POC checks file signatures but does not provide a malware scanning service.

Budget allocations describe remaining costs; keep prepaid amounts out of them. The inclusion rule controls whether recorded prepaid booking amounts count against the trip target. Expenses remain a separate actual-spending record, and all currencies are kept separate. Allocation currencies are stored explicitly so changing the trip's display currency cannot reinterpret older amounts. Cost ranges are manually entered assumptions, not researched estimates. Packing templates are account-private, and applying one explicitly adds unpacked copies of its items.

`npm run test:e2e:auth` tests the configured login/protected shell at mobile and desktop widths; it does not sign in or send emails. The production build and Supabase URL/publishable key must be configured first. See `tests/PHASE2_ACCEPTANCE.md` for the live acceptance checks still required. For production at `https://pfew.vercel.app`, set `NEXT_PUBLIC_SITE_URL` to that origin in Vercel and allow `https://pfew.vercel.app/auth/callback` in Supabase.
