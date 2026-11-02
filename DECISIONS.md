# Decisions

- Exclusively a mobile-first web application deployed with Next.js on Vercel. No native clients or App Store workflow.
- Keep all external writes in server actions with Zod validation and user-scoped RLS. Missing credentials produce an honest setup state.
- Owner-only access for Phase 1. Collaboration must add policies deliberately in Phase 4.
- Use independent dated segments to avoid equating destinations with hotels. Explicit idea/planned/confirmed states avoid inventing reservations.
- Start with accessible native form controls and a Radix Slot/cva button primitive compatible with shadcn patterns. Custom brand styling is shared across screens.
- Segment columns capture known address, provider, reference, route and local arrival details separately. Unknown values remain blank. Richer booking-specific details will use dedicated child records.
- No external place data, AI claims, offline cache, or demo reservations. These require later explicit integrations.

- Create guided trips and destinations atomically with an invoker-rights PostgreSQL function, so a rejected destination cannot leave a partially created trip. Link many independent stays to one destination with an optional foreign key.
