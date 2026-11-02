> Platform requirement: exclusively a responsive, mobile-first web application deployed on Vercel. No React Native, Expo, Swift, Kotlin, or App Store workflow. Optional browser PWA installation only.

# PFEW. — MASTER PRODUCT & ENGINEERING PROMPT FOR CODEX

## Your role

You are the lead product engineer, UX architect, and full-stack developer building **Pfew.**, a mobile-first AI-powered travel companion.

Your objective is to build a real, functional, extensible web application—not a landing page, static prototype, generic dashboard, or collection of disconnected mockups.

Work as an experienced engineering partner. Make sensible implementation decisions, explain important trade-offs, and prioritize working end-to-end flows.

**Implement the product in phases. Begin with Phase 1 only.** Do not attempt to build the entire application in a single pass.

---

## 1. Product vision

Pfew. is a personal and collaborative travel companion that helps travelers organize existing plans, prepare for their trips, discover relevant places, manage travel budgets, and navigate their vacations.

Its primary value is reducing travel-planning friction and helping people feel organized and confident before and during a trip.

Pfew. is **not** primarily a chatbot that generates arbitrary vacations from scratch.

Users generally know where they want to go. They need help organizing their travel information, identifying gaps, making informed decisions, and enriching their itinerary.

The application must be genuinely useful in two situations:

**Before traveling**
- Organize destinations, transportation, accommodation, and activities.
- Prepare documents and travel requirements.
- Track bookings and important deadlines.
- Estimate and configure a realistic trip budget.
- Discover suitable places and experiences.
- Identify possible gaps or conflicts.

**During traveling**
- Quickly see today's plans and upcoming bookings.
- Access essential information and documents.
- Explore nearby places.
- Find activities and restaurants matching available time and budget.
- Record optional expenses.
- Access essential saved trip details without internet.

Design the application around these real user needs.

---

## 2. Brand and design direction

**Brand:** Pfew.

**Typography:** Manrope.

**Visual style:** Playful, premium, editorial, modern, approachable, and highly polished.

The product should feel like a contemporary travel lifestyle brand rather than enterprise software.

Use:
- Bold editorial typography.
- Generous whitespace.
- Rounded cards and surfaces.
- Colorful modular layouts.
- Strong visual hierarchy.
- Mobile-first interactions.
- Subtle, purposeful animations.
- Clean navigation.
- Excellent empty, loading, and error states.

Suggested brand palette:
- Lavender: `#D9B4EF`
- Lime: `#E0F57B`
- Cobalt: `#435BC9`
- Orange: `#F45C39`
- Soft pink: `#F0C7E9`
- Off-white: `#F6F6F8`
- Dark ink: `#202023`

These colors are starting tokens, not a requirement to use every color on every screen.

Avoid:
- Generic SaaS dashboards.
- Corporate-looking interfaces.
- Glassmorphism.
- Generic purple AI gradients.
- Excessive borders and shadows.
- Dense data tables on mobile.
- Decorative UI that reduces usability.

Use a cohesive design system with accessible contrast, keyboard support, responsive layouts, and touch-friendly controls.

The interface copy should initially be in English. Structure copy so localization can be added later.

---

## 3. Technology stack

Use:

- Next.js with App Router.
- TypeScript in strict mode.
- React.
- Tailwind CSS.
- shadcn/ui and Radix primitives, heavily customized to match Pfew.'s identity.
- Lucide icons.
- Supabase PostgreSQL.
- Supabase Auth.
- Supabase Storage.
- Supabase Row Level Security.
- Vercel-compatible deployment.
- Google Maps JavaScript API and Google Places API for maps and place discovery.
- A server-side AI provider abstraction, initially compatible with an OpenAI API integration.
- A PWA-compatible architecture for essential offline access.

Choose lightweight, well-maintained supporting libraries where necessary.

Use Zod for validating external input and server-side payloads.

Keep API secrets server-side. Never expose AI credentials, Supabase service-role credentials, or privileged API keys in client bundles.

Apply appropriate restrictions to any browser-exposed Google Maps key.

Do not introduce a separate custom backend or microservices unless there is a demonstrated need.

---

## 4. Core navigation and screens

The main product consists of:

1. Home
2. Trip Hub
3. Itinerary
4. Map
5. Prep
6. Packing
7. Bookings
8. Budget

Additionally, provide contextual experiences for:
- Ideas
- Smart Trip Check
- Smart Add
- Trip collaborators
- Settings and profile

Ideas and Trip Check do not necessarily need permanent top-level navigation items.

Design mobile navigation to prioritize the most frequently used destinations. Do not force all eight sections into a cramped bottom bar.

On desktop, use a more spacious navigation structure.

---

## 5. Home — Adaptive Home

Home is a personal travel dashboard.

It should highlight the next or currently active trip and provide access to other trips.

The content changes based on the trip's lifecycle.

### Before the trip

Prioritize:
- Upcoming trip.
- Departure countdown.
- Preparation progress.
- Important pending tasks.
- Relevant Trip Check findings.
- Budget overview.
- Quick access to itinerary and bookings.

### During the trip

Prioritize:
- Current trip day.
- Today's itinerary.
- Next upcoming booking or planned event.
- Relevant location and map actions.
- Explore nearby.
- Budget access.
- Optional quick expense entry.

### After the trip

Keep the trip available as a past trip with its itinerary, saved places, documents, and manually recorded expenses.

The lifecycle should be calculated from trip dates, with appropriate handling of time zones.

All sections must remain accessible regardless of lifecycle state.

Do not create three separate applications.

---

## 6. Trip Hub — Modular and customizable

Each trip has a customizable hub composed of modular cards.

Users can:
- Reorder modules.
- Show or hide modules on the hub.
- Choose supported card sizes.
- Highlight preferred modules.
- Maintain a different layout for each trip.

Hiding a module from the hub must not delete its data or remove access from navigation.

Persist module preferences per trip.

Use sensible default layouts and keep the editing interaction simple.

Do not build a full Notion-style page builder.

---

## 7. Guided trip creation

New trips are created through a short, guided, skippable setup.

Collect:
- Trip name, optional.
- Start and end dates.
- Destinations and approximate stay dates.
- Travelers.
- Preferred travel style: Budget, Comfort, or Luxury.
- Optional overall budget and currency.
- Optional existing booking details.

Users must be able to skip nonessential steps and complete the trip later.

A newly created trip should have a valid empty structure.

Never fabricate flights, hotel reservations, activities, or booking confirmations.

The selected travel style should influence later AI recommendations and budget estimates.

It must remain editable at any time.

---

## 8. Smart Trip Segments — Core data model

Trips are not merely lists of days.

Model a trip as a sequence of meaningful segments, including:
- Destinations.
- Stays and periods of accommodation.
- Transportation legs.
- Layovers.
- Day trips.
- Activities and planned events.

Support:
- Multiple destinations.
- Multiple hotels within one destination.
- Transportation between destinations.
- Airport transfers.
- Ferries.
- Rental cars.
- Stopovers without overnight stays.
- Day trips that do not change the primary accommodation.
- Flexible activities without fixed times.

Maintain a coherent chronological itinerary across all segments.

Represent dates, local times, and time zones explicitly where needed.

Do not assume that a destination always corresponds to one hotel or one continuous stay.

Use a normalized, extensible database schema.

---

## 9. Itinerary — Hybrid overview and timeline

The itinerary combines:
- A horizontal day selector.
- A detailed chronological timeline for the selected day.
- Destination and travel segment context.
- Bookings and activities.
- Flexible, unscheduled items.
- Contextual AI suggestions.

Users can:
- Add items.
- Edit items.
- Reorder flexible items.
- Move activities between days.
- Add optional times and durations.
- Distinguish confirmed bookings from tentative plans.
- Navigate easily across days and destinations.

Preserve the distinction between:
- Ideas.
- Planned activities.
- Confirmed bookings.

Do not silently convert a suggestion into a confirmed reservation.

---

## 10. Smart Add

Provide a unified Smart Add entry point.

Support two complementary workflows.

### Quick Add

For:
- Places.
- Restaurants.
- Activities.
- Notes.
- Ideas.

Allow users to enter:
- A name.
- A search query.
- An address.
- A supported Google Maps link.
- An optional day or destination.

Show a preview when a place can be resolved reliably.

### Detailed Forms

For:
- Flights.
- Accommodation.
- Ferries.
- Trains.
- Transfers.
- Car rentals.
- Other transportation.
- Booked activities.

Use structured forms with appropriate fields, dates, times, locations, confirmation numbers, and notes.

### Attachments and AI extraction

Support attaching PDFs and images to bookings.

Allow optional AI-assisted extraction of relevant details.

Always show extracted fields for user review before saving.

Distinguish extracted, user-confirmed, and unknown values.

Do not invent missing confirmation numbers, flight details, or prices.

Do not integrate email inbox access for booking imports.

---

## 11. Bookings — Smart Travel Wallet

Bookings should be accessible through:
- A chronological timeline.
- A category-based view.

Categories include:
- Flights.
- Accommodation.
- Ground transportation.
- Ferries and other transfers.
- Car rentals.
- Activities.
- Other reservations.

Each booking can contain:
- Provider.
- Booking reference.
- Start and end date/time.
- Locations.
- Travelers.
- Price and currency, if known.
- Payment status, if known.
- Notes.
- Attachments.
- Verification state.

Provide easy access to the most relevant booking during travel.

AI may flag missing or conflicting details but must not claim a reservation is invalid without evidence.

---

## 12. Map — Smart Map

Provide an interactive Google Map with:
- Trip destinations.
- Saved places.
- Planned activities.
- Relevant accommodation and transportation points.
- Filters.
- A synchronized list view.

Support contextual place discovery when requested.

AI recommendations should consider:
- Destination.
- Relevant trip day.
- Approximate geographic proximity.
- Available time.
- Travel style.
- Budget.
- User preferences.

Use real place identifiers and grounded map data where available.

Do not fabricate map pins, opening hours, ratings, routes, or travel times.

Keep AI suggestions visually distinct from saved and confirmed places.

---

## 13. Ideas — Save for later or add to itinerary

Users can save interesting places and activities without scheduling them.

Each suggestion should support:
- Save to Ideas.
- Add to a selected itinerary day.
- Optional time and duration.
- View on map.
- Remove or dismiss.

Ideas are not confirmed plans.

Adding an idea to a day does not mean a reservation exists.

Make Ideas accessible contextually from Map and Itinerary.

---

## 14. Prep — Smart Prep Hub

Create a preparation dashboard with:
- Progress indicators.
- Categorized tasks.
- Due dates.
- Priority.
- Completion status.
- Custom tasks.
- AI-suggested tasks.

Potential categories:
- Documents.
- Entry requirements.
- Health and insurance.
- Transportation.
- Accommodation.
- Payments.
- Connectivity.
- Other preparations.

Users can accept, edit, dismiss, or complete suggestions.

When providing entry or travel-document information:
- Account for nationality, travel document, destination, and relevant travel dates.
- Prefer official sources.
- Show source links and verification dates.
- Make uncertainty explicit.
- Do not assert that a visa or form is mandatory without adequate evidence.

---

## 15. Packing — Smart Packing

Support:
- Packing lists per traveler.
- Shared packing items.
- Categories.
- Quantities.
- Packed/unpacked state.
- Custom items.
- Reusable templates.
- AI suggestions.

AI suggestions can consider:
- Trip duration.
- Destinations.
- Planned activities.
- Luggage allowances, if provided.
- Relevant conditions when verified.

Users must approve AI-generated additions.

Packing should remain fully usable without AI.

---

## 16. Budget — Smart Budget Planner

Budget is a first-class module, not merely an expense tracker.

During Guided Setup, allow users to select:
- Budget.
- Comfort.
- Luxury.

Also allow:
- Custom total budget.
- Preferred currency.
- Number of travelers.
- Categories.
- Budget inclusion rules.
- Per-day allocations.
- Per-destination allocations.

Provide estimated spending ranges for:
- Food and drinks.
- Local transport.
- Activities.
- Other relevant costs.

Keep prepaid bookings separate from projected remaining expenses to avoid double counting.

Allow budget allocations to vary by day and destination.

### AI budget intelligence

AI should:
- Provide grounded cost estimates where data is available.
- Show approximate ranges rather than false precision.
- Explain assumptions.
- Consider the selected travel tier.
- Suggest restaurants and activities matching the user's budget.
- Compare planned activities with the budget allocation.
- Help redistribute planned spending across days.

Travel tiers are preferences, not rigid constraints.

### Optional manual expense tracking

Users may manually record:
- Amount.
- Currency.
- Category.
- Date.
- Optional note.
- Optional trip day.

Support cash expenses.

Do not request banking credentials or integrate bank accounts for the POC.

If no expenses have been entered, show **"Actual spending: Not tracked."**

Never imply that actual spending is known from the planned budget.

Distinguish:
- Estimated.
- Planned.
- Booked/prepaid.
- Manually recorded actual spending.

---

## 17. Smart Trip Check

Provide a centralized Trip Check overview with contextual findings shown in relevant modules.

Potential checks:
- Missing transportation information.
- Possible accommodation gaps.
- Overlapping reservations.
- Suspicious date or time conflicts.
- Missing booking details.
- Relevant preparation tasks.
- Unconfirmed travel-document requirements.

Each finding must:
- Explain the observation.
- State why it may matter.
- Identify uncertainty.
- Link to the relevant part of the trip.
- Offer an appropriate next action.

Support actions such as:
- Add details.
- Already arranged.
- Remind me later.
- Not needed.
- Dismiss.

Persist user decisions.

Do not repeatedly raise dismissed findings without new evidence.

A missing item in Pfew. is not proof that the traveler has failed to arrange it.

Allow users to rerun Trip Check manually.

AI must not modify the itinerary or reservations without explicit confirmation.

---

## 18. AI behavior — Proactive but discreet

AI should be a contextual assistant, not an intrusive chatbot.

Use proactive intelligence for:
- Preparation issues.
- Potential itinerary conflicts.
- Missing or incomplete information.
- Relevant deadlines.

Use on-demand suggestions for:
- Restaurants.
- Beaches.
- Attractions.
- Activities.
- Day trips.
- Nearby discoveries.

Do not automatically fill every free hour of the itinerary.

Do not make changes without user approval.

Every AI-derived factual claim should distinguish:
- Verified information.
- Estimates or suggestions.
- Unknown or unverified information.

---

## 19. AI research strategy — Cost-efficient hybrid

Use a **Smart Research Hybrid** approach optimized for a low-cost POC.

Combine:
- Structured trip data.
- Google Maps and Places where appropriate.
- Official travel information sources.
- Selective external research.
- AI reasoning and summarization.

Cost-control requirements:
- Avoid unnecessary background research.
- Do not trigger external place searches on every page render.
- Use caching only where permitted by provider terms.
- Use inexpensive models for simple structured tasks.
- Reserve more capable models for complex analysis when needed.
- Set server-side request limits.
- Add usage monitoring.
- Support a configurable monthly spending threshold.
- Provide Mock Mode for development without paid AI or Maps calls.

Use a provider abstraction so AI models can be changed without rewriting business logic.

Never fabricate source citations.

For price, opening-hour, availability, or entry-requirement claims, show freshness and uncertainty where relevant.

---

## 20. Collaborative Trips

Support multiple users working on the same trip.

Use three roles:

**Owner**
- Manages the trip.
- Invites and removes members.
- Assigns roles.
- Controls trip-level settings.

**Editor**
- Can add and modify shared trip content.
- Can contribute to itinerary, Ideas, bookings, Prep, Packing, and shared budget data.

**Viewer**
- Can access permitted shared trip content.
- Cannot edit shared data.

Personal documents and sensitive traveler information must remain private by default.

Do not automatically expose passports, personal identity documents, or sensitive attachments to all collaborators.

Implement authorization on the server and through Supabase RLS—not merely by hiding buttons.

Record a minimal audit trail for important changes.

Require confirmation for destructive actions.

---

## 21. Essential Offline Access

Pfew. is not a fully offline-editable application.

Provide a deliberate **"Make trip available offline"** action.

Support read-only offline access to essential trip information that has been downloaded in advance, including:
- Itinerary.
- Key booking details.
- Addresses.
- Booking references.
- Relevant notes.
- Explicitly selected documents, where securely feasible.

Show:
- Whether a trip is available offline.
- When it was last refreshed.
- What information is included.
- Whether the displayed information may be outdated.

Do not promise offline Google Maps functionality.

AI, external searches, editing, and expense entry require connectivity.

Do not implement offline mutation queues or conflict-resolution engines.

Avoid storing sensitive personal documents insecurely. Use appropriate local protection and provide a way to remove downloaded trip data.

---

## 22. Notifications

Use **in-app reminders only**.

Show relevant reminders in:
- Home.
- Prep.
- Trip Check.

Do not implement email reminders or web push notifications for the POC.

Authentication emails and invitations are separate transactional workflows, not reminder notifications.

Keep reminders contextual, actionable, and non-alarmist.

---

## 23. Authentication

Use Supabase Auth with:
- Google Sign-In.
- Email magic links.

Provide:
- Login.
- Logout.
- Auth callback handling.
- Protected routes.
- User profile.
- Trip ownership.
- Invitations and role-based membership.

Use secure sessions and appropriate server-side checks.

Do not build custom password authentication.

---

## 24. Data architecture

Design a normalized Supabase schema that can support the complete product.

Potential entities include:
- profiles
- trips
- trip_members
- travelers
- destinations
- trip_segments
- stays
- transport_legs
- bookings
- booking_attachments
- itinerary_items
- saved_places
- ideas
- prep_tasks
- packing_lists
- packing_items
- budgets
- budget_allocations
- expenses
- trip_check_findings
- finding_decisions
- notifications
- trip_hub_preferences
- audit_events

These are conceptual entities. Refine them into a coherent schema rather than blindly creating every table.

Define clear ownership, foreign keys, constraints, indexes, timestamps, and deletion behavior.

Use RLS for every user-accessible table.

Ensure that shared-trip permissions do not override private-document restrictions.

Use migrations checked into the repository.

---

## 25. Engineering standards

Build production-quality foundations even though this is a POC.

Requirements:
- Strict TypeScript.
- Clear component boundaries.
- Reusable UI primitives.
- Server-side validation.
- Explicit error handling.
- Loading and empty states.
- Accessible forms.
- Responsive layouts.
- Secure file handling.
- Sensible logging without leaking personal information.
- Database migrations.
- Seed/demo data clearly labeled as demo data.
- Unit tests for important domain logic.
- Integration tests for key persistence and authorization flows.
- Basic end-to-end coverage for core user journeys.

Do not use fake frontend-only interactions where real persistence is required.

Do not invent successful API responses.

If an external service is not configured, show a meaningful setup or unavailable state rather than silently pretending the integration works.

---

## 26. Implementation phases

### Phase 1 — Working foundation

Implement first:
- Project setup.
- Brand design system.
- Responsive application shell.
- Google and email magic-link authentication.
- Supabase schema and RLS foundation.
- Create, edit, and delete trips.
- Guided trip setup.
- Smart Trip Segments.
- Destination and stay management.
- Basic transport-leg management.
- Hybrid itinerary interface.
- Smart Add with structured forms and manual Quick Add.
- Modular Trip Hub with persisted layout preferences.
- Basic Home with trip countdown and trip navigation.

Phase 1 must have real data persistence and working navigation.

Do not implement AI extraction, live Google Places, or advanced collaboration yet.

However, design the schema and service boundaries to support later phases.

### Phase 2 — Travel essentials

Implement:
- Smart Travel Wallet.
- Booking attachments.
- Prep Hub.
- Packing.
- Budget Planner.
- Optional manual expense tracking.
- Adaptive Home for during-trip use.
- Contextual in-app reminders.

### Phase 3 — AI intelligence

Implement:
- AI service abstraction.
- Smart Trip Check.
- Smart Gaps & Decisions.
- Google Maps/Places.
- Ideas.
- Contextual AI suggestions.
- Budget-aware recommendations.
- Selective research with source handling.
- Optional AI booking-document extraction with user review.
- Cost monitoring and Mock Mode.

### Phase 4 — Travel-ready

Implement:
- Collaborative Trips.
- Invitations.
- Owner/Editor/Viewer permissions.
- Private-document controls.
- Audit trail.
- Essential Offline Access.
- Security hardening.
- End-to-end testing.
- Deployment verification.

Each phase must be usable and tested before starting the next one.

---

## 27. Phase 1 acceptance criteria

Phase 1 is complete only when a user can:

1. Sign in using Google or an email magic link.
2. Create a new trip through Guided Setup.
3. Enter multiple destinations with dates.
4. Add stays and transportation legs.
5. View a coherent day-by-day itinerary.
6. Add, edit, move, and remove itinerary items.
7. Save and retrieve trip data from Supabase.
8. Customize the Trip Hub layout and retain those preferences.
9. Navigate the application comfortably on mobile and desktop.
10. Sign out and sign back in without losing saved trip information.

Additionally:
- Unauthorized users cannot access private trips.
- Forms validate input.
- Time and date handling is consistent.
- Loading and error states are functional.
- There are no known blocking TypeScript, lint, or build errors.
- The app can run locally with documented setup steps.

Do not declare Phase 1 complete if these criteria are unmet.

---

## 28. Required project documentation

Maintain:
- `README.md` — setup, environment variables, local development, deployment.
- `PRODUCT_SPEC.md` — product vision and functional requirements.
- `ARCHITECTURE.md` — system design, data model, security boundaries.
- `ROADMAP.md` — implementation phases and status.
- `DECISIONS.md` — important engineering decisions and trade-offs.
- `.env.example` — documented configuration variables, without secrets.

Document external services that require manual configuration.

---

## 29. Your immediate assignment

Start by inspecting the repository.

If the repository is empty, initialize the application using the agreed stack.

Then:

1. Briefly summarize the architecture you intend to use.
2. Create the initial project structure.
3. Establish the Pfew. design system.
4. Implement the Phase 1 database schema and RLS policies.
5. Implement authentication and the protected application shell.
6. Implement Guided Setup, trip management, Smart Trip Segments, Itinerary, Smart Add, and modular Trip Hub.
7. Connect the interfaces to real Supabase persistence.
8. Add relevant tests.
9. Run available checks and fix issues.
10. Document setup instructions and remaining configuration steps.

**Do not stop after generating a plan. Implement Phase 1.**

If credentials are missing, build everything that can be built safely, provide `.env.example`, and clearly identify the manual setup steps.

Do not fabricate successful integration tests.

Do not proceed to Phase 2 automatically.

At the end, provide:
- What was implemented.
- Files and major modules created.
- Database migrations added.
- Tests and checks run, with actual results.
- Environment variables and services still requiring configuration.
- Known limitations.
- Instructions to run the app.
- Recommended next steps for Phase 2.

The ultimate objective is a beautiful, reliable, genuinely useful travel companion that feels like **Pfew.**, not a generic AI-generated software demo.