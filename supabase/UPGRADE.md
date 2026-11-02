# Upgrade existing Phase 2 projects

Keep the existing tables and data. After migrations 001–004, run **005, 006, 007, 008 in that order**, using Supabase SQL Editor. The combined `upgrade_phase2_to_phase4.sql` contains these exact migrations, so it is one paste/run. Do not rerun 001. The upgrade files can be rerun together in the same order.

- 005: resolved city IDs, coordinates and automatic destination/linked-plan time zones.
- 006: saved places, Trip Check decisions, reviewed suggestions and request budgets.
- 007: verified-email invitations, owner/editor/viewer RLS and minimal audit events.
- 008: uploader-private documents, upload reservations and guarded deletion.

No auth settings, Google credentials or API keys are changed by SQL. The existing `booking-files` bucket remains private. Existing documents are marked ready; new uploads reserve pending metadata first, then upload, then mark ready. Supabase SQL Editor runs with administrator privileges; the app never uses them.

After upgrading, use two Google accounts to verify invitations and document privacy as described in `tests/PHASE34_ACCEPTANCE.md`. Local PostgreSQL tests exercise RLS but cannot prove the deployed project has these migrations or policies. Custom policies added outside this repository must also be reviewed: permissive policies are combined with OR by PostgreSQL.
