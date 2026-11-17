"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { resolveLocation } from "../lib/locations";
export async function changeDestination(
  input: unknown,
): Promise<{ error?: string }> {
  const parsed = z
    .object({
      trip: z.uuid(),
      tripRevision: z.number().int().nonnegative(),
      source: z.enum(["saved", "segment"]),
      key: z.string().max(2048),
      revision: z.number().int().nonnegative(),
      operation: z.enum(["save", "remove"]),
      title: z.string().trim().max(200).default(""),
      locationId: z.string().max(2048).default(""),
      start: z.union([z.literal(""), z.iso.date()]).default(""),
      end: z.union([z.literal(""), z.iso.date()]).default(""),
      notes: z.string().max(4000).default(""),
    })
    .safeParse(input);
  if (!parsed.success)
    return { error: "Check the destination name and dates." };
  const v = parsed.data;
  if (
    v.operation === "save" &&
    (!v.title || (v.start && v.end && v.end < v.start))
  )
    return {
      error: !v.title
        ? "Add a destination name."
        : "The end date can’t be before the start date.",
    };
  const location = v.locationId ? resolveLocation(v.locationId) : null;
  // An unchanged legacy identifier is checked against the stored row in SQL;
  // it need not remain resolvable by today's provider to retain its coordinates.
  const { db } = await access();
  const { error } = await db.rpc("change_trip_destination", {
    target: v.trip,
    expected_revision: v.tripRevision,
    source_kind: v.source,
    entry_key: v.key,
    segment_revision: v.revision,
    operation: v.operation,
    details: {
      title: v.title,
      location_id: v.locationId,
      location,
      start_date: v.start,
      end_date: v.end,
      notes: v.notes,
    },
  });
  if (error)
    return {
      error:
        error.code === "PGRST202"
          ? "Destination editing isn’t available yet."
          : /linked plans/i.test(error.message)
            ? "Move linked plans to another destination before changing or removing this place."
            : /dates|date/i.test(error.message)
              ? "Choose valid destination dates within your trip."
              : /location/i.test(error.message)
                ? "Choose the new location from the search results."
                : "This destination changed or is unavailable. Refresh before trying again.",
    };
  revalidatePath("/trips/" + v.trip);
  return {};
}
