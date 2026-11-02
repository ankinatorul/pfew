# Decisions

- Exclusively a mobile-first web application deployed with Next.js on Vercel. No native clients or App Store workflow.
- Keep all external writes in server actions with Zod validation and user-scoped RLS. Missing credentials produce an honest setup state.
- Owner-only access for Phase 1. Collaboration must add policies deliberately in Phase 4.
- Use independent dated segments to avoid equating destinations with hotels. Explicit idea/planned/confirmed states avoid inventing reservations.
- Start with accessible native form controls and a Radix Slot/cva button primitive compatible with shadcn patterns. Custom brand styling is shared across screens.
- Segment columns capture known address, provider, reference, route and local arrival details separately. Unknown values remain blank. Richer booking-specific details will use dedicated child records.
- No external place data, AI claims, offline cache, or demo reservations. These require later explicit integrations.

- Create guided trips and destinations atomically with an invoker-rights PostgreSQL function, so a rejected destination cannot leave a partially created trip. Link many independent stays to one destination with an optional foreign key.

- Phase 2 keeps reservations separate from itinerary segments, with optional same-trip links. Saving a reservation record never confirms an unrelated plan automatically.
- Budget projections and manual actuals are independent totals; prepaid inclusion is explicit. No exchange rates are invented, and allocation currency is immutable with respect to later trip currency changes.
- Booking documents use a private bucket, user-scoped storage access, 3 MB uploads and short-lived download URLs. Documents are downloaded rather than embedded. No service-role key is required.
- Packing templates are explicit user-approved additions. Prep consists of custom tasks with in-app due reminders; entry requirements and health claims are not generated.

- Public deployment settings are checked in for this Pfew instance and injected by Next.js when environment values are missing or blank. Only the Supabase browser-publishable key, project URL and canonical site URL belong in this configuration; explicit environment overrides take precedence. Privileged tokens remain outside version control.

- Authentication is Google-only at the user’s request. Email UI and the magic-link server action are removed. The app checks Google provider availability and requires a Google-linked user for protected requests. The Supabase project owner must also disable Email and enable Google in Auth settings to enforce the provider choice outside the app.
