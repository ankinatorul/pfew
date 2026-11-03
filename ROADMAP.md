# Roadmap

## Phases 1–2 — implemented

Google-only authentication and account controls, real trip/segment persistence, guided multi-destination setup, flexible itinerary, independent stays/journeys, customized hub, booking wallet/private attachments, Prep, Packing/templates, budget projections and separate manual expenses. User reports production Google sign-in working. Full signed-in production acceptance remains unverified from this environment.

## Phase 3 — implemented core, integrations require configuration

Automatic city-derived time zones, server AI abstraction, explicit sample/live modes, contextual budget/style-aware unverified ideas, review before saving, day/time/duration scheduling, Trip Check with evidence/uncertainty and persistent decisions, saved city/place notes, optional real Google Maps/Places with attribution and retrieval time, and serialized request-budget controls.

The follow-up release implements reviewed booking text/PDF/image imports and official-source research with human-reviewed excerpts and linked Prep tasks. Paid provider configuration and live acceptance remain pending. No researched price, reservation, requirement or availability claims are made without a source.

## Phase 4 — implemented, live acceptance pending

Verified-email invitations, Owner/Editor/Viewer database authorization, minimal audit trail, uploader-private document reservations and deletion guards, deliberate encrypted read-only offline downloads, optional browser PWA installation, response security headers, local cross-account PostgreSQL and browser offline tests.

User reports migrations through 009 applied successfully and the application working. Remaining: run independently verified signed-in two-account Google/Supabase/Storage acceptance, verify provider configuration and the deployed Vercel commit. Network/admin access limitations prevent claiming these live checks passed. See `tests/PHASE34_ACCEPTANCE.md`.

## Follow-up release — reviewed imports and source research

Implemented: private temporary import previews; grounded labeled-text extraction without AI; optional consent-based AI PDF/image/text reading; explicit approval before shared booking creation; idempotent saves; finite official-source catalog; nationality/document/purpose/date context; bounded on-demand source fetches; exact excerpt recheck before saving; source freshness/context warnings; one linked Prep task per approved note; viewer/read and editor/write policies.

User reports the database upgrade succeeded. Pending: real provider/file and official-site acceptance, signed-in browser tests and independent deployment verification. AI recommendations stay unverified; no automatic visa/entry eligibility decisions are implemented. Missing provider keys and blocked source sites remain explicit unavailable states.

## Everyday planning release — implemented

Quick Add accepts personal names, addresses, notes and supported Google Maps links, with a deliberate preview and explicit choice of unscheduled Idea or planned day. Shortened links remain unexpanded and unverified. Optional Google lookup is on demand and budgeted; only IDs and personal labels/notes persist. One-row day/time edits support activities and notes, preserve independent booking records, demote changed confirmed plans and protect against stale updates. Trip Check compares real saved instants across zones, reports time overlaps/uncertain DST times and notices linked booking-date differences. No additional SQL migration or credentials are required for the basic flow. Live signed-in acceptance remains pending; network policy still blocks direct production verification from this workspace.
