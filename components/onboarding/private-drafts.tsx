import { resolveLocation } from "../../lib/locations";
import { locationFields } from "../../lib/automatic-zones";
import { access } from "../../lib/access";
import type { Trip, Segment } from "../../lib/domain";
import { candidateSchema } from "../../lib/onboarding";
import { BookingForm } from "../essentials/forms";
import { bookingDraft } from "../../lib/booking-import-types";
export async function PrivateOnboardingDrafts({
  trip,
  segments,
}: {
  trip: Trip;
  segments: Segment[];
}) {
  const { db, user } = await access();
  const { data, error } = await db
    .from("trip_onboarding")
    .select("preferences")
    .eq("trip_id", trip.id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Private setup drafts could not be loaded.");
  const parsed = candidateSchema
    .array()
    .safeParse(data?.preferences?.pending_bookings || []);
  if (!parsed.success)
    throw new Error(
      "The private draft format could not be read. Your stored data has not been changed.",
    );
  const drafts = parsed.data;
  return (
    <section>
      <h2>Your private setup drafts</h2>
      <p>
        Only you can see these incomplete imports. Complete a draft and save a
        booking when ready. Review the reservation state separately. Saving
        moves a reviewed draft into your wallet once.
      </p>
      {!drafts.length && <p>No private booking drafts.</p>}
      {drafts.map((d) => (
        <details key={d.id}>
          <summary>
            {d.fields.title || "Booking to finish"} · incomplete, unverified
          </summary>
          <BookingForm
            onboardingDraftId={d.id}
            trip={trip}
            segments={segments}
            draft={{
              ...bookingDraft({
                fields: d.fields,
                method: d.method === "manual" ? "text" : d.method,
                importKey: d.id,
                warnings: [],
                evidence: {},
              }),
              ...locationFields(
                d.departureCity ? resolveLocation(d.departureCity) : null,
              ),
              ...locationFields(
                d.arrivalCity ? resolveLocation(d.arrivalCity) : null,
                "end_",
              ),
              timezone:
                (d.departureCity
                  ? resolveLocation(d.departureCity)?.timezone
                  : null) || trip.timezone,
              end_timezone:
                (d.arrivalCity
                  ? resolveLocation(d.arrivalCity)?.timezone
                  : null) || "",
              verification: "unverified",
            }}
          />
        </details>
      ))}
    </section>
  );
}
