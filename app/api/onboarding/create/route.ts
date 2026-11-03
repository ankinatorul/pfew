import { NextResponse } from "next/server";
import { currentGoogleUser } from "../../../../lib/auth-session";
import { supabase } from "../../../../lib/supabase";
import {
  onboardingSchema,
  candidateComplete,
} from "../../../../lib/onboarding";
import { tripSchema } from "../../../../lib/domain";
import { bookingSchema } from "../../../../lib/essentials";
import { resolveLocation } from "../../../../lib/locations";
import { locationFields } from "../../../../lib/automatic-zones";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function POST(request: Request) {
  if (!(await currentGoogleUser()))
    return reply({ error: "Sign in with Google first." }, 401);
  if (Number(request.headers.get("content-length")) > 150000)
    return reply({ error: "This setup is too large." }, 413);
  const parsed = onboardingSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply(
      { error: parsed.error.issues[0]?.message || "Check your trip details." },
      400,
    );
  const input = parsed.data;
  let writesStarted = false;
  try {
    const destinations = input.destinations.map((d) => {
      const city = resolveLocation(d.locationId);
      if (
        !city ||
        d.start < input.start ||
        d.end > input.end ||
        d.end < d.start
      )
        throw new Error(
          "Choose each destination city and dates within your trip.",
        );
      return {
        title: city.label,
        start_date: d.start,
        end_date: d.end,
        timezone: city.timezone,
        ...locationFields(city),
      };
    });
    const zone =
      [...destinations].sort((a, b) =>
        a.start_date.localeCompare(b.start_date),
      )[0]?.timezone || input.timezone;
    const trip = tripSchema.parse({
      name: input.name,
      start_date: input.start,
      end_date: input.end,
      timezone: zone,
      travelers: input.travelers,
      style: input.style,
      budget: input.budget,
      currency: input.currency,
    });
    const selected = input.bookings.filter((b) => b.included);
    if (selected.some((b) => !b.reviewed))
      throw new Error(
        "Review each included booking before creating your trip, or remove it from this import.",
      );
    const pending = selected
      .filter((b) => !candidateComplete(b))
      .map((b) => ({
        ...b,
        evidence: undefined,
        warnings: b.warnings?.slice(0, 5),
      }));
    const bookings = selected.filter(candidateComplete).map((b) => {
      const start = b.departureCity ? resolveLocation(b.departureCity) : null,
        end = b.arrivalCity ? resolveLocation(b.arrivalCity) : null;
      if ((b.departureCity && !start) || (b.arrivalCity && !end))
        throw new Error("Choose booking cities from the location results.");
      const f = b.fields;
      return {
        ...bookingSchema.parse({
          ...f,
          trip_id: input.requestId,
          segment_id: null,
          provider: f.provider || "",
          reference: f.reference || "",
          origin: f.origin || "",
          destination: f.destination || "",
          travelers: "",
          notes: "",
          local_time: f.local_time || "",
          end_local_time: f.end_local_time || "",
          timezone: start?.timezone || zone,
          end_timezone:
            end?.timezone ||
            (f.category === "accommodation" ? start?.timezone || zone : ""),
          payment_status: "unknown",
          verification: b.confirmed ? "user confirmed" : "unverified",
          ...locationFields(start),
          ...locationFields(end, "end_"),
        }),
        import_key: b.id,
        import_method: b.method,
      };
    });
    const db = await supabase();
    writesStarted = true;
    const { data: id, error } = await db.rpc("create_onboarding_trip", {
      request_key: input.requestId,
      trip_data: trip,
      destinations,
      approved_bookings: bookings,
      preferences: { interests: input.interests, pending_bookings: pending },
    });
    if (error || !id)
      return reply(
        {
          error:
            "Your trip could not be created. Check the connection and apply onboarding migration 010, then retry. Your setup remains here.",
        },
        503,
      );
    const { data: saved, error: readError } = await db
      .from("trips")
      .select("id,name,start_date,end_date")
      .eq("id", id)
      .single();
    if (readError || !saved)
      return reply(
        {
          error:
            "Your trip may have saved. Retry to recover the same trip; it will not create a duplicate.",
        },
        503,
      );
    return reply({ trip: saved, href: "/trips/" + id + "?view=destinations" });
  } catch (error) {
    if (writesStarted)
      return reply(
        {
          error:
            "The save response was interrupted. Retry to recover the same trip without duplicates.",
        },
        503,
      );
    return reply(
      {
        error:
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "Check booking dates, amounts and currencies. Unknown details can remain in review.",
      },
      400,
    );
  }
}
