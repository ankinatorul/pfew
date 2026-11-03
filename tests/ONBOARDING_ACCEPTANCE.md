# New-trip onboarding acceptance

1. Apply migration 010 to the existing schema-9 project. New trip → check the five-step panel against the supplied UI image at mobile/desktop widths. Existing trip settings should retain their form.
2. Enter dates/name. Add real manual destination cities and periods; reject out-of-trip dates. Also create a trip with no destinations/bookings. No accommodation/transfer should be required.
3. Select multiple small PDF/images. Verify file sizes/types and explicit AI consent. Without provider configuration, manual entry/skip remains available and no success is fabricated. With a provider, read each separately; retain a successful preview after another source fails and retry only the failed source. Original documents should not appear in Storage unless separately attached in the Wallet.
4. Edit extracted fields and check source evidence. Editing clears review/confirmation. Confirming review alone must leave the reservation unverified. Explicitly confirm a complete reservation separately. Unknown details must stay blank; a timed booking needs selected cities for automatic zones. Incomplete reviewed candidates should become private drafts, not fake wallet records.
5. Choose a budget tier, interests, currency, travelers and optional total. Create a flight-only trip. The result must say accommodation is not added, without asserting it is unbooked. Navigate to the real created trip. Retry an interrupted create and ensure there is one trip.
6. Reload and inspect persisted trip preferences and wallet records. Confirm private incomplete drafts appear only for the owner under Private setup drafts. Complete one using the structured form: it should save once, respect selected verification and remove the private draft atomically.
7. Invite an Editor/Viewer. Shared wallet records follow existing roles, but neither collaborator may read owner-private drafts/preferences through UI or direct REST/RPC. No private source files/references should leak through diagnostics.
8. Check offline handling, a failed create and validation recovery. Controls must not queue offline mutations. Leaving/reloading an unsaved setup discards in-memory files and drafts; source originals are not a backup.

Automated fixtures use illustrative responses and do not replace these real authenticated/provider checks. Database and provider configuration are distinct from successful production acceptance.

## Responsive refinement

Check phone (375px), tablet (768px), laptop (1366×768) and desktop (1440px). Desktop should use a wide content panel and step rail, parallel upload/manual paths and wider preference/review layouts; it must not show the phone-sized 440px panel. Tablet uses wider single-column content. Resize mid-flow: field values and review/confirmation states must survive. The primary action should be visible on a standard laptop at the basics step. Previous-step navigation must preserve data and future steps must stay disabled. Verify long titles, file names, an expanded booking editor and keyboard focus without horizontal overflow. This refinement has no database changes.
