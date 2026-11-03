import { z } from "zod";
import { NextResponse } from "next/server";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { packingProvider } from "../../../lib/packing-ai";
import { withoutExisting } from "../../../lib/readiness";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  if (!(await currentGoogleUser()))
    return reply({ error: "Sign in required" }, 401);
  const parsed = z
    .object({
      trip_id: z.uuid(),
      list_id: z.uuid(),
      clothing_days: z.coerce.number().int().min(1).max(30),
      consent: z.literal(true),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return reply(
      {
        error:
          "Choose a packing list, clothing days and consent before sending context to AI.",
      },
      400,
    );
  let provider;
  try {
    provider = packingProvider();
  } catch {
    return reply(
      {
        error:
          "AI packing suggestions are unavailable. The checklist starter still works.",
      },
      503,
    );
  }
  const input = parsed.data,
    db = await supabase();
  const [trip, list, segments, bookings, existing] = await Promise.all([
    db
      .from("trips")
      .select("start_date,end_date")
      .eq("id", input.trip_id)
      .single(),
    db
      .from("packing_lists")
      .select("id")
      .eq("trip_id", input.trip_id)
      .eq("id", input.list_id)
      .single(),
    db
      .from("trip_segments")
      .select("kind,title,transport_mode")
      .eq("trip_id", input.trip_id)
      .neq("status", "idea"),
    db.from("bookings").select("category").eq("trip_id", input.trip_id),
    db
      .from("packing_items")
      .select("title")
      .eq("trip_id", input.trip_id)
      .eq("list_id", input.list_id),
  ]);
  if (
    !trip.data ||
    !list.data ||
    trip.error ||
    list.error ||
    segments.error ||
    bookings.error ||
    existing.error
  )
    return reply({ error: "Packing context could not be loaded." }, 404);
  const { data: reservation, error } = await db.rpc("reserve_service", {
    target: input.trip_id,
    kind: "ai",
  });
  if (error)
    return reply(
      { error: "AI permission or request budget unavailable." },
      429,
    );
  try {
    const modes = [
      ...(segments.data || []).map((item) => item.transport_mode),
      ...(bookings.data || []).map((item) =>
        item.category === "flight" ? "flight" : item.category,
      ),
    ].filter(Boolean);
    const suggestions = await provider.suggest(
      {
        days:
          Math.round(
            (Date.parse(trip.data.end_date) -
              Date.parse(trip.data.start_date)) /
              86400000,
          ) + 1,
        destinations: (segments.data || [])
          .filter((item) => item.kind === "destination")
          .map((item) => item.title),
        transportModes: [...new Set(modes)],
        hasBookings: !!bookings.data?.length,
      },
      input.clothing_days,
    );
    await db.rpc("finish_service", { reservation, succeeded: true });
    return reply({
      items: withoutExisting(suggestions, existing.data || []),
      source: "ai",
    });
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    return reply(
      {
        error:
          "AI suggestions could not be completed. No packing items were added.",
      },
      503,
    );
  }
}
