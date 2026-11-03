# New-trip onboarding

The user's supplied six-panel UI image is the visual reference. This implementation changes `/trips/new` only, plus private draft completion and the server support required by that flow. The existing trip settings form and existing booking-import behavior remain available. It does not claim access to the Figma file.

## Flow

1. Trip name and travel dates, with a narrow rounded panel, progress bar, readable date labels and native date pickers.
2. Multiple PDF/JPEG/PNG sources (up to eight, 3 MB each) or manual destinations/booking details. Files are sent individually and sequentially after explicit AI consent. Successful reads survive failures; retry reads only failed/waiting files. Unread files must be explicitly skipped or removed to continue. No original file is automatically stored in Supabase; private copies can be attached through the existing Wallet controls later.
3. Editable extraction previews and source evidence. Every included candidate requires review. A separate checkbox confirms that a reservation exists; reviewing text alone leaves verification unverified. Unknown fields remain blank. Dates/currency/category and cities for clock times must be supplied before a complete wallet booking is created. Incomplete reviewed candidates are retained as owner-private drafts instead of inventing values. Original excerpts remain temporary; private drafts retain edited fields and a bounded warning list.
4. Budget-friendly/Balanced/Comfort & experiences map to existing Budget/Comfort/Luxury preferences. Interests, optional total budget, currency and travelers persist. No accommodation or transfer is required.
5. Actual trip creation result links to Journey, Wallet, itinerary, Map and Packing. Flight-only setups use the “A great start” result and say accommodation is not added, without claiming it is unbooked. Empty manual trips are valid.

Private drafts remain accessible from the owner's trip navigation → **Private setup drafts**. Completing a draft uses the existing structured booking form, retains explicit verification selection, requires review before shared saving, and atomically consumes the draft once.

## Database and providers

Existing schema-9 projects need **only `supabase/migrations/010_trip_onboarding.sql`**, pasted into Supabase SQL Editor and run once. It can be safely reapplied. It does not drop existing trip data. A new project needs numbered migrations 001–010 in order; an older Phase 2 project needs the existing combined upgrade through 009 followed by 010.

The migration adds owner-private preferences/drafts and three RPCs. `reserve_onboarding_ai` uses the same advisory lock, monthly estimated budget and actor/day limits as other services, without requiring a persisted trip. `create_onboarding_trip` runs trip/destination creation, approved wallet inserts and private preferences in one transaction, with an owner/request idempotency key. `complete_onboarding_draft` locks the owner-private row, adds the reviewed booking and removes that draft atomically; retries return the existing booking. Mutations use ordinary user-scoped clients and existing RLS; no service-role key is introduced.

Document reading needs existing server variables `AI_MODE=live` and `AI_API_KEY` (optional `AI_MODEL`). With no provider, the UI explicitly offers manual entry/skip and never fabricates extraction. Migration 010 alone does not enable an AI provider. SQL cannot be applied from this workspace without privileged Supabase access; the app shows an explicit readiness notice until the table is available.

Raw selected files and the unsaved wizard live in browser memory only; reloading/leaving before creation discards them. Transient failure retries reuse a stable request body/key; validation failures permit correction. User input, arrays, files and provider outputs are validated/bounded on the server. No inbox, native app or bank integration is involved.

## Verification

Local PostgreSQL tests cover migration replay, atomic rollback, empty/flight-only creation, idempotency, uploader/owner privacy from a shared editor, draft completion retries and shared daily-budget accounting. Route tests enforce Google identity, consent, configuration and review before writes/calls. React tests cover validation, multiple files, failed-source retry, review/confirmation separation, preferences and offline/schema restrictions.

The browser fixture bundles the production onboarding component with a development-only esbuild tool, loads actual app CSS, and drives all five steps plus flight-only results at 375px and 1440px. Its network responses and documents are explicitly illustrative; no fake authenticated application route is added. Review images live under `test-results/onboarding-*.png`. These checks do not establish a live AI request, production migration application or actual Google/Supabase persistence acceptance.
