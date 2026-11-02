# Roadmap

## Phases 1–2 — implemented

Google-only authentication and account controls, real trip/segment persistence, guided multi-destination setup, flexible itinerary, independent stays/journeys, customized hub, booking wallet/private attachments, Prep, Packing/templates, budget projections and separate manual expenses. User reports production Google sign-in working. Full signed-in production acceptance remains unverified from this environment.

## Phase 3 — implemented core, integrations require configuration

Automatic city-derived time zones, server AI abstraction, explicit sample/live modes, contextual budget/style-aware unverified ideas, review before saving, day/time/duration scheduling, Trip Check with evidence/uncertainty and persistent decisions, saved city/place notes, optional real Google Maps/Places with attribution and retrieval time, and serialized request-budget controls.

Remaining: configure/test paid provider keys in production; optional AI booking-document extraction with review; selective official-source travel-requirement research beyond fresh Google place data. No researched price, reservation, requirement or availability claims are made without a source.

## Phase 4 — implemented, live acceptance pending

Verified-email invitations, Owner/Editor/Viewer database authorization, minimal audit trail, uploader-private document reservations and deletion guards, deliberate encrypted read-only offline downloads, optional browser PWA installation, response security headers, local cross-account PostgreSQL and browser offline tests.

Remaining: apply migrations 005–008 to the live project, run signed-in two-account Google/Supabase/Storage acceptance, verify provider configuration and the deployed Vercel commit. Network/admin access limitations prevent claiming these live checks passed. See `tests/PHASE34_ACCEPTANCE.md`.
