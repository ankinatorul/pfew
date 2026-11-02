import { NextResponse } from "next/server";
import { z } from "zod";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { googlePlaceDetails } from "../../../lib/google-places";
export async function POST(request: Request) {
  if (!(await currentGoogleUser()))
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const input = z
    .object({
      trip_id: z.uuid(),
      place_id: z.string().regex(/^[A-Za-z0-9_-]{5,300}$/),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Invalid place request" },
      { status: 400 },
    );
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return NextResponse.json(
      { error: "Place details are unavailable for this deployment." },
      { status: 503 },
    );
  const db = await supabase();
  const { data: place } = await db
    .from("saved_places")
    .select("id")
    .eq("trip_id", input.data.trip_id)
    .eq("google_place_id", input.data.place_id)
    .maybeSingle();
  if (!place)
    return NextResponse.json(
      { error: "Saved place unavailable" },
      { status: 404 },
    );
  const { data: reservation, error } = await db.rpc("reserve_service", {
    target: input.data.trip_id,
    kind: "places",
  });
  if (error)
    return NextResponse.json(
      { error: "Search permission or request budget unavailable." },
      { status: 429 },
    );
  try {
    const result = await googlePlaceDetails(input.data.place_id);
    await db.rpc("finish_service", { reservation, succeeded: true });
    return NextResponse.json(
      { result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    return NextResponse.json(
      { error: "Place details could not be loaded." },
      { status: 503 },
    );
  }
}
