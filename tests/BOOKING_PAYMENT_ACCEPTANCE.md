# Booking place, currencies and payment reminders

Implemented locally on 17 November 2026. No live database writes, migrations applied, deployment, push or merge. Prior pending map/destination work remains intact.

## What changed

- Existing shared booking drawer retained across Create Trip and saved bookings. Stay uses **Where are you staying?**; Experience keeps Place, Transport its endpoints and Other its simple title. Existing debounced Photon/OSM autocomplete, keyboard/touch handling and optional manual names remain. A selected place saves existing name/label, provider identifier, verified coordinates and available address without displaying another address input. Manual places retain optional address entry. Existing custom titles/addresses and unchanged coordinates are preserved.
- Currency selector offers **EUR (€), USD ($), RON (lei)**. Existing currency is retained when editing; new entries use a supported trip currency or EUR. Changing currency never converts or changes amounts. A legacy unsupported saved currency remains as a hidden current selection to prevent silent currency changes; the available choices are the three approved currencies.
- Three selectable payment states: Paid, Pay later, Not set. Historical partial-payment state remains saved unless the user explicitly changes it; its amount is not rewritten. Pay later offers mutually exclusive property payment or a dated deadline. Due dates are validated in the drawer/server and required for the dated option. Dates before departure are valid. A deadline after trip end produces a warning, not rejection. Booking details/cards show the arrangement or due date.
- In-app payment reminders reuse **prep_tasks**, the existing trip preparation/reminder list and dashboard task summaries. Linked reminders open the booking editor. No new reminder service/dashboard, email, push or paid API is introduced.

## Prepared database change — not applied

`supabase/migrations/025_booking_payment_arrangements.sql` is required to persist property payment and linked reminders. It depends on 018 and its prerequisites (including 016/017); shared editing continues to depend on existing 019 permissions. It does not depend on unrelated destination migrations 023/024.

It adds:

1. `bookings.payment_arrangement`: unspecified (legacy default), property or due_date, with a constraint requiring a date for unpaid dated arrangements.
2. A unique nullable `prep_tasks.booking_id`, referencing bookings with delete cascade; a same-trip guard rejects cross-trip associations.
3. An invoker-security trigger that creates/updates one linked Payments task after booking insert/payment changes. It includes booking name, known price/currency (or amount-not-set), and due date. Paid, property payment, cleared deadlines and cancelled reservations resolve an existing linked task. Booking deletion removes its linked task through the foreign key. Other tasks are untouched.
4. Extensions to the existing authorized/revision-checked managed-booking RPC and idempotent reviewed-booking insertion path, preserving all prior authorization and booking fields. Empty deadlines normalize to null before PostgreSQL record conversion. The existing intake transfer trigger carries staged payment information into the same booking transaction.
5. `booking_payment_options_version()` as a read-only capability marker. Payment arrangement controls remain disabled when the reviewed update is absent. Other booking edits preserve old payment data.

The migration is transactional, additive and intended to run once. Existing bookings, reminders, files, trips, permissions and amounts are not backfilled or rewritten. Existing dated bookings receive a linked reminder on their next relevant save; this migration deliberately does not create historical reminders automatically. Failed reminder writes roll back the booking save as part of the same transaction.

## Changed files

- Shared UI: `components/simple-booking-fields.tsx`, `components/smart-booking-name.tsx`, `components/shared-booking.tsx`, `components/booking-manager.tsx`.
- Helpers/types: `lib/booking-payment.ts` (new), `lib/simple-booking.ts`, `lib/booking-budget.ts`, `lib/essentials.ts`.
- Persistence/capabilities: `app/booking-budget-actions.ts`, `app/api/booking-collection/route.ts`, `components/booking-budget.tsx`, `app/trips/new/page.tsx`.
- Existing reminder links: `components/essentials/view.tsx`, `components/trip-overview-view.tsx`.
- New migration 025 and optional `supabase/VERIFY_BOOKING_PAYMENT_READ_ONLY.sql`.
- New payment client/database regression tests and updated booking/browser fixtures and expectations.

## Verification

The full unit/isolated database suite passed **541 tests in 122 files**. Subsequent focused regressions cover final UI changes, Editor/Owner shared updates, trip isolation, one stable linked reminder, date edits, paid completion, property payment, deletion, validation rollback and staged-booking transfer. Final focused regressions passed **9 tests**. Desktop/mobile browser suites passed **44 tests**. Lint, TypeScript and production build passed; build required retry after the recurring existing Next.js security/upgrade advisory. No dependency upgrade was made. A final screenshot check confirmed the due-date picker is visibly usable on mobile.

All write tests use local fixtures/mocks/PGlite. No automated writes ran against live Supabase. Provider search responses are mocked; real-world property and street-address coverage depends on Photon/OpenStreetMap. No coordinates or address components are invented when unavailable.

Desktop/mobile captures: `tests/screenshots/booking-payment/{desktop,mobile}/payment-deadline.png`.

## Activation and limits

Nothing needs to be run automatically. To enable the new saved payment options, review migration 025 against the intended project's actual 018/016/017 definitions and 019 if collaboration is used. The optional read-only verification file can be pasted into Supabase SQL Editor before/after review; it changes nothing. After explicit approval, run the complete 025 file once and use the matching application code. Do not rerun earlier migrations merely because they exist locally.

Live schema state and a real two-account production workflow were not verified here. Application capability checks keep unsupported payment options disabled. Existing reminders live in trip preparation; this repository has no separate global Reminders dashboard to extend. Stop for review.
