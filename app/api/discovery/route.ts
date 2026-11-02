import { NextResponse } from "next/server";
import { z } from "zod";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { googlePlaces } from "../../../lib/google-places";
export async function POST(request: Request) {
  if (!(await currentGoogleUser()))
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const input = z
    .object({ trip_id: z.uuid(), query: z.string().trim().min(2).max(200) })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Choose a trip and enter a search query." },
      { status: 400 },
    );
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return NextResponse.json(
      {
        error:
          "Place discovery is not configured. Saved cities and places remain available.",
      },
      { status: 503 },
    );
  const db = await supabase();
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
    const results = await googlePlaces(input.data.query);
    await db.rpc("finish_service", { reservation, succeeded: true });
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    return NextResponse.json(
      {
        error:
          "Place discovery is temporarily unavailable. No places were saved.",
      },
      { status: 503 },
    );
  }
}
