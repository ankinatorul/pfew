# Decisions

- Build only a responsive mobile-first Next.js web app on Vercel. Browser PWA installation is optional; no native clients or store deployment.
- Google-only sign-in follows the user's updated requirement. Email/password UI is absent; the Supabase administrator must disable unwanted providers at project level too.
- City/country selection determines local time automatically. Keep IANA zones as internal persisted data; never ask users to type or select them. Preserve unknown arrival information instead of guessing.
- All writes use validated user-scoped Supabase clients; RLS remains the final boundary. No privileged service key in application code.
- Independent destinations/stays/journeys and atomic guided creation prevent hotel assumptions and partial trip creation. Explicit idea/planned/confirmed states never invent reservations.
- Budget targets, planned remaining costs, prepaid inclusion and actual manual expenses are separate; retain each record's currency and invent no exchange rates.
- Use owner/editor/viewer roles. Only owners manage access and trip settings; a narrow RPC permits editor budget changes. Invitations require the intended verified email and are shared manually.
- Documents stay private to uploaders regardless of shared roles. Reserve metadata before Storage upload, retain incomplete state on uncertain failure, require storage removal before metadata and block parent deletion while files remain.
- Trip Check reports saved observations plus uncertainty. User decisions persist through stable fingerprints. Suggestions require review and remain unscheduled until deliberately planned.
- Sample Mode is visibly labeled and makes no paid calls. Live AI output is unverified and bounded; source-free official guidance, fake venues/prices/citations and automatic reservations are excluded.
- Persist Google place IDs and personal labels/notes, not provider response contents. Load current details explicitly, show attribution/retrieval time and use honest no-key states.
- Serialize estimated service-budget reservations and daily request limits in SQL. Estimates do not replace provider billing/quota controls; browser map loads need separate controls.
- Offline downloads are optional, explicit, encrypted and read-only. Keep passphrases out of storage/server requests and avoid caching authenticated pages. No edit queue or offline Maps. Revocation cannot erase a prior download.
- Public deployment defaults contain only browser-publishable configuration. Secrets and tokens remain outside version control. Health endpoints report release/configuration presence, never pretend to verify SQL/auth/provider readiness.

- Keep booking source text/files temporary until review, and save only explicitly approved shared fields. No automatic raw-file upload, inbox integration or inferred confirmation/payment data. AI file processing requires separate consent and bounded document inspection; quoted model output alone is not verification.
- Use explicit labeled-text extraction without a key rather than showing fabricated mock bookings. Unknown dates and currencies must be supplied during review. Idempotent import keys prevent repeat-save duplicates.
- Official research uses a finite trusted source catalog and exact excerpt matching, with nationality/document/purpose/date context and retrieval/review times. Do not turn source retrieval into a visa decision. Free research still consumes the shared daily request allowance.

- Reuse schema 9 for Quick Add and daily planning. Keep unexpanded Maps links as user-provided links, require deliberate review before saving, and make provider lookup optional and budgeted.
- Treat an itinerary move as a plan change; keep actual booking records independent and demote changed confirmed items. Protect concurrent day edits with the saved row version and open the target day on success.
- Compare known schedule instants across IANA zones with Temporal. Reject ambiguous DST conversion, avoid invented durations/travel time, and describe overlaps or linked-date differences as observations for review.

- Offer real checklist starters without paid services, with optional minimal-context AI packing. Require review before every addition; preserve existing packed/completed states and leave suggested deadlines unknown until chosen.
- Use stable IDs and conflict-ignore bulk inserts for repeat-safe additions under existing RLS, rather than creating another schema migration.
- Treat budget distribution as explicit arithmetic over the user's amount and preferences. Use integer cents, keep estimates unknown and append allocations while preserving existing prepaid/actual accounting. Context checks detect stale previews but are not a global budget lock.
