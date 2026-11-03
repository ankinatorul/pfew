import { NextResponse } from "next/server";
import { z } from "zod";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { googlePlaceDetails } from "../../../lib/google-places";
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
      place_id: z.string().regex(/^[A-Za-z0-9_-]{5,300}$/),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return reply({ error: "Choose a supported Google place identifier." }, 400);
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return reply(
      {
        error:
          "Google place lookup is unavailable. You can save your own label and link.",
      },
      503,
    );
  const db = await supabase(),
    { data: reservation, error } = await db.rpc("reserve_service", {
      target: parsed.data.trip_id,
      kind: "places",
    });
  if (error)
    return reply(
      { error: "Place lookup permission or request budget unavailable." },
      429,
    );
  try {
    const result = await googlePlaceDetails(parsed.data.place_id);
    await db.rpc("finish_service", { reservation, succeeded: true });
    return reply({ result });
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    return reply(
      { error: "This place could not be looked up. Nothing was saved." },
      503,
    );
  }
}
