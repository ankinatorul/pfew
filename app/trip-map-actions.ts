"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
export async function reorderDestinations(
  input: unknown,
): Promise<{ error?: string }> {
  const parsed = z
    .object({
      trip: z.uuid(),
      revision: z.number().int().nonnegative(),
      ids: z.array(z.string().min(1).max(2048)).min(1).max(500),
      segments: z
        .array(
          z.object({ id: z.uuid(), revision: z.number().int().nonnegative() }),
        )
        .max(500),
    })
    .safeParse(input);
  if (!parsed.success)
    return { error: "Refresh the destinations before reordering." };
  const { db } = await access();
  const { error } = parsed.data.ids.some((id) => id.startsWith("saved:"))
    ? await db.rpc("change_trip_destination", {
        target: parsed.data.trip,
        expected_revision: parsed.data.revision,
        source_kind: "saved",
        entry_key: "order",
        segment_revision: 0,
        operation: "reorder",
        details: { ids: parsed.data.ids, segments: parsed.data.segments },
      })
    : await db.rpc("reorder_trip_destinations", {
        target: parsed.data.trip,
        expected_revision: parsed.data.revision,
        ordered_ids: parsed.data.ids,
        segment_versions: parsed.data.segments,
      });
  if (error)
    return {
      error:
        error.code === "PGRST202"
          ? "Destination ordering isn’t available yet."
          : "Destinations changed or editing access is unavailable. Refresh before trying again.",
    };
  revalidatePath("/trips/" + parsed.data.trip);
  return {};
}
