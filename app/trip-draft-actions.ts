"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { access } from "../lib/access";
import { resolveLocation } from "../lib/locations";
import {
  tripBasicsSchema,
  privateDraftSchema,
  type DraftSaveResult,
} from "../lib/trip-drafts";

export async function saveTripDraft(
  id: string,
  revision: number,
  input: unknown,
): Promise<DraftSaveResult> {
  const parsed = tripBasicsSchema.safeParse(input);
  if (
    !z.uuid().safeParse(id).success ||
    !Number.isInteger(revision) ||
    revision < 0
  )
    return { error: "This draft could not be identified. Reopen Create Trip." };
  if (!parsed.success)
    return {
      error: parsed.error.issues.map((issue) => issue.message).join(" "),
    };
  // Resolve canonical identities again; never trust coordinates or timezones from a form.
  const destinations = parsed.data.destinations.map((location) =>
    resolveLocation(location.id),
  );
  if (destinations.some((location) => !location))
    return { error: "Choose each destination again before saving." };
  const { db } = await access();
  try {
    const { data, error } = await db.rpc("save_trip_draft", {
      target: id,
      expected_revision: revision,
      basics: { ...parsed.data, destinations },
    });
    if (error) {
      if (error.message.includes("changed in another tab"))
        return {
          error:
            "This draft changed in another tab. Your inputs are still here. Reload to review the saved version before saving again.",
        };
      if (error.code === "PGRST202" || error.code === "42883")
        return {
          error:
            "Private drafts need database migration 010. Your inputs are kept in this browser; ask your developer to review the migration.",
        };
      return {
        error:
          "Your draft could not be saved. Your inputs are still here. Check your connection and try again.",
      };
    }
    const saved = privateDraftSchema.safeParse(data);
    if (!saved.success)
      return {
        error:
          "The save could not be confirmed. Retry to check the same draft safely.",
      };
    revalidatePath("/trips/new");
    return { draft: saved.data };
  } catch {
    return {
      error:
        "Your draft could not be saved. Your inputs are still here. Try again when you’re connected.",
    };
  }
}
