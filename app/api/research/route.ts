import { NextResponse } from "next/server";
import { z } from "zod";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { sourcesForLocation } from "../../../lib/research-catalog";
import { retrieveOfficialSource } from "../../../lib/official-research";
import { researchContextSchema } from "../../../lib/research-types";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function POST(request: Request) {
  if (!(await currentGoogleUser()))
    return reply({ error: "Sign in required" }, 401);
  const parsed = z
    .object({
      trip_id: z.uuid(),
      destination_id: z.uuid(),
      source_id: z.string().max(50),
      context: researchContextSchema,
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return reply(
      {
        error:
          "Choose a destination and enter nationality, document, purpose and travel dates.",
      },
      400,
    );
  const input = parsed.data,
    db = await supabase();
  const { data: destination } = await db
    .from("trip_segments")
    .select("location_id")
    .eq("id", input.destination_id)
    .eq("trip_id", input.trip_id)
    .eq("kind", "destination")
    .single();
  if (
    !destination ||
    !sourcesForLocation(destination.location_id).some(
      (source) => source.id === input.source_id,
    )
  )
    return reply(
      { error: "Choose an official source for this resolved destination." },
      400,
    );
  const { data: reservation, error } = await db.rpc("reserve_service", {
    target: input.trip_id,
    kind: "research",
  });
  if (error)
    return reply(
      {
        error:
          "Research permission or daily request limit unavailable. Apply migration 009 if needed.",
      },
      429,
    );
  try {
    const result = await retrieveOfficialSource(input.source_id);
    await db.rpc("finish_service", { reservation, succeeded: true });
    return reply(result);
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    return reply(
      {
        error:
          "The official source could not be previewed. Open its website directly; no guidance was generated or saved.",
      },
      503,
    );
  }
}
