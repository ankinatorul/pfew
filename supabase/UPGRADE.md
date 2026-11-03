# Upgrade existing Phase 2 projects

Keep the existing tables and data. After migrations 001–004, run **005, 006, 007, 008, 009 in that order**, using Supabase SQL Editor. The combined `upgrade_phase2_to_phase4.sql` contains these exact migrations, so it is one paste/run. Do not rerun 001. The upgrade files can be rerun together in the same order.

- 005: resolved city IDs, coordinates and automatic destination/linked-plan time zones.
- 006: saved places, Trip Check decisions, reviewed suggestions and request budgets.
- 007: verified-email invitations, owner/editor/viewer RLS and minimal audit events.
- 008: uploader-private documents, upload reservations and guarded deletion.
- 009: reviewed booking import keys/RPC, source notes, linked Prep tasks and zero-cost research request accounting.

If 005–008 are already applied, run only `migrations/009_research_and_booking_imports.sql`.

No auth settings, Google credentials or API keys are changed by SQL. The existing `booking-files` bucket remains private. Existing documents are marked ready; new uploads reserve pending metadata first, then upload, then mark ready. Supabase SQL Editor runs with administrator privileges; the app never uses them.

After upgrading, use two Google accounts to verify invitations and document privacy as described in `tests/PHASE34_ACCEPTANCE.md`. Local PostgreSQL tests exercise RLS but cannot prove the deployed project has these migrations or policies. Custom policies added outside this repository must also be reviewed: permissive policies are combined with OR by PostgreSQL.

## New-trip onboarding — migration 010

For this existing project with 001–009 already applied, open Supabase → SQL Editor → New query, paste all of `supabase/migrations/010_trip_onboarding.sql`, then click Run. This adds private onboarding preferences/drafts, atomic retry-safe trip creation and bounded pre-trip AI accounting. It does not replace or drop existing tables. Do not rerun foundation 001.

New projects use 001–010 in order. Projects still on Phase 2 first use `upgrade_phase2_to_phase4.sql` (005–009), then 010. The app's setup report now expects schema 10. Migration 010 is rerunnable. Provider credentials are configured separately in Vercel; no AI credentials belong in SQL.
