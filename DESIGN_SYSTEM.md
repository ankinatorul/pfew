# Pfew website design rules

The existing Next.js website, shared tokens and working components are the source of truth. Preserve the five onboarding steps, branding, typography, colors, form controls, radii and navigation patterns. Figma boards illustrate UX concepts; they are not literal layouts to reproduce.

Use normal responsive Grid/Flexbox layouts: full content width with page padding on phones, compact mobile progress, comfortable touch targets, and wider forms on desktop. Do not add outer mockup frames, device previews, fixed-size artboards or new feature shells. The user removed the onboarding side panel: retain the compact step label/progress bar above the form instead. Keep global website navigation and account controls accessible. Reuse routed workspace sections and existing Supabase actions; confirmed, unverified and not-recorded details must remain distinct.

The following Journey notes describe its implementation history, not authorization to redesign other screens.

# Pfew visual system — Journey review

The user's “DESIGN SYSTEM RESET & VISUAL FIDELITY” brief replaces the prior generic card presentation. This increment stops at **Journey Overview**, pending visual approval before applying the system to other modules. No reference screenshots accompanied the written upload; this is a first pass against the written specification, not a claim of reference-image fidelity.

## Tokens and presentation

`app/design-tokens.css` centralizes Manrope, the exact background/ink/lavender/lime/cobalt/orange/pink palette, display/section scales, radii and spacing. Existing aliases retain their original values so other screens keep their current presentation. `app/journey.css` styles the new primitives and scopes navigation changes to Journey.

`components/pfew/primitives.tsx` provides PageHeader, SectionHeader, EditorialCard, StatusPill, EmptyState and InsightCard. `journey-view.tsx` adds DestinationCard and TransportConnection. `context-menu.tsx` uses Radix for a keyboard/touch menu with 44px targets, existing edit/move forms, offline restrictions and confirmed deletion through the existing action. Unneeded future primitives (DaySelector/TimelineItem) are deferred with their screens.

Destination names lead, followed by formatted dates, calendar nights, location and saved stay/activity/idea summaries. Card colors identify successive story chapters; they are not reservation states. The status pill distinguishes a confirmed plan from a booking confirmation. Transport rows use saved records and explicit uncertainty instead of invented connections or duration. The cobalt Trip Check panel reads existing findings/decisions/run time and never automatically runs checks or provider research. The pink Ideas panel uses real saved counts.

## Data and scope

The existing `?view=destinations` URL now presents Journey Overview; navigation labels it **Journey**. It remains separate from the Day Itinerary. Destination periods are excluded from the daily activity list, without redesigning the Day screen. Home, Trip Hub, wallet, preparation, packing, budget and Map redesigns await approval.

The authenticated server wrapper uses the current user's Supabase client, trip-scoped reads and a minimal booking projection. Summary/connection derivation lives in `lib/journey.ts`. Explicit destination/city links take priority; ambiguous date-only records are not assigned to a guessed stop. Unscheduled ideas do not use placeholder dates for attribution. Linked stay/activity bookings are not counted twice. Transport bookings can supply connections without an additional itinerary leg; linked duplicates are suppressed, unverified bookings remain labeled, and unmatched journeys stay accessible.

All data, Google authentication, RLS, mutation actions and schema remain in place. No SQL or provider key is required. Read errors go to the existing error boundary rather than showing invented empty summaries. Viewers see read-only navigation; actions also retain server/RLS enforcement.

## Review artifacts and limits

Playwright renders the production presentation and stylesheet in an isolated HTML fixture at 375px and 1440px, with explicitly labeled illustrative trip data. It writes `test-results/journey-mobile.png` and `test-results/journey-desktop.png`; these are review artifacts, not a fake signed-in route or replacement for real production records. Layout checks cover the prescribed colors, readable dates, touch targets and overflow. Unit/server/menu tests cover real derivation, read scope, decisions, viewer state and confirmed actions. Live authenticated Supabase acceptance remains separate.

Review these images and the real Journey screen before carrying the visual system to the next module. Reference screenshots can support a subsequent fidelity pass when provided.
