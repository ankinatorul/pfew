"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { access } from "../lib/access";
import { aiProvider } from "../lib/ai";
import {
  activityInput,
  activityValues,
  itineraryAIContext,
  type ItineraryCommand,
  type ItineraryActivity,
  type ItineraryResult,
} from "../lib/itinerary";
import type { Trip } from "../lib/domain";
import type { Booking } from "../lib/essentials";
const uuid = z.uuid(),
  day = z.iso.date();
const commandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), input: activityInput }),
  z.object({
    op: z.enum(["delete", "complete"]),
    id: uuid,
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal("reorder"),
    day,
    order: z
      .array(z.object({ id: uuid, revision: z.number().int().nonnegative() }))
      .max(500),
  }),
  z.object({
    op: z.enum(["add-idea", "dismiss-idea"]),
    id: uuid,
    day,
    destination: z.string().max(2048),
  }),
  z.object({ op: z.literal("unlink"), id: uuid, segment: uuid }),
]);
export async function changeItinerary(
  tripId: string,
  command: ItineraryCommand,
): Promise<ItineraryResult> {
  const parsed = commandSchema.safeParse(command);
  if (!uuid.safeParse(tripId).success || !parsed.success)
    return {
      error: parsed.success
        ? "Trip unavailable."
        : parsed.error.issues[0].message,
    };
  const { db } = await access();
  if (command.op === "save") {
    const [t, s] = await Promise.all([
      db.from("trips").select("*").eq("id", tripId).single(),
      db.from("trip_segments").select("*").eq("trip_id", tripId),
    ]);
    if (t.error || s.error)
      return {
        error: "Could not load your plan. Your input is preserved; try again.",
      };
    try {
      const old = (s.data as ItineraryActivity[]).find(
        (s) => s.id === command.input.id,
      );
      activityValues(
        command.input,
        { ...t.data, timezone: old?.timezone || t.data.timezone } as Trip,
        s.data,
      );
    } catch (e) {
      return {
        error:
          e instanceof Error ? e.message : "Check the activity date and time.",
      };
    }
  }
  const { data, error } = await db.rpc("change_itinerary", {
    target: tripId,
    command: parsed.data,
  });
  if (error) return { error: mutationError(error) };
  revalidatePath("/trips/" + tripId);
  revalidatePath("/");
  return data as ItineraryResult;
}
function mutationError(error: { code?: string; message: string }) {
  if (error.code === "PGRST202" || error.code === "42703")
    return "The itinerary update is not enabled in this database yet. Your input is preserved. Migration 014 needs developer review.";
  if (
    /changed|reorder|unavailable|permission|within your trip|clock change|after.*time|scheduled day|already|dismissed|request limit|service budget/i.test(
      error.message,
    )
  )
    return error.message;
  return "Could not save this change. Your input is preserved. Check your connection and editing access, then try again.";
}
export async function exploreItineraryIdeas(
  tripId: string,
  input: {
    requestId: string;
    day: string;
    destination: string;
    interests: string;
  },
): Promise<ItineraryResult> {
  const parsed = z
    .object({
      requestId: uuid,
      day,
      destination: z.string().max(2048),
      interests: z.string().trim().max(500),
    })
    .safeParse(input);
  if (!uuid.safeParse(tripId).success || !parsed.success)
    return { error: "Check the selected day and interests." };
  const { db } = await access();
  if (process.env.AI_MODE !== "live" || !process.env.AI_API_KEY)
    return {
      error:
        "Live ideas are not configured yet. You can still add your own activities.",
    };
  const [trip, segments, bookings] = await Promise.all([
    db
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .eq("creation_state", "finalized")
      .single(),
    db.from("trip_segments").select("*").eq("trip_id", tripId),
    db.from("bookings").select("*").eq("trip_id", tripId),
  ]);
  if (trip.error || segments.error || bookings.error)
    return { error: "Could not load your trip context. Please try again." };
  let context;
  try {
    context = itineraryAIContext(
      trip.data as Trip,
      segments.data,
      bookings.data as Booking[],
      input.day,
      input.destination,
      input.interests,
    );
  } catch {
    return { error: "Choose a saved destination and valid trip day." };
  }
  const reserved = await db.rpc("reserve_itinerary_ideas", {
    target: tripId,
    request_id: input.requestId,
  });
  if (reserved.error) return { error: mutationError(reserved.error) };
  if (!reserved.data.created) {
    if (reserved.data.outcome === "succeeded") {
      revalidatePath("/trips/" + tripId);
      return { message: "Saved ideas restored. No new AI request was made." };
    }
    return {
      error:
        reserved.data.outcome === "failed"
          ? "This request failed. Start a new search when you are ready."
          : "This request is still processing or its response was interrupted. Reload saved ideas before starting another search.",
    };
  }
  let ideas;
  try {
    ideas = await aiProvider("live").suggest(context);
  } catch {
    await db.rpc("finish_service", {
      reservation: reserved.data.id,
      succeeded: false,
    });
    return {
      error:
        "Ideas are unavailable right now. Your itinerary is unchanged. You can try a new search later.",
    };
  }
  const saved = await db.rpc("persist_itinerary_ideas", {
    target: tripId,
    reservation: reserved.data.id,
    request_id: input.requestId,
    source_context: {
      day: input.day,
      destination: context.destination,
      destination_id: input.destination,
      style: context.style,
    },
    ideas,
  });
  if (saved.error)
    return {
      error:
        "Ideas could not be saved. Reload saved ideas before starting another search. Your itinerary is unchanged.",
    };
  revalidatePath("/trips/" + tripId);
  return {
    message: ideas.length
      ? "Ideas saved. Review them before adding anything."
      : "No new ideas found. Try different interests or add your own activity.",
  };
}
