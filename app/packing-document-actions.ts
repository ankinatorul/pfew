"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import {
  packingInput,
  reminderInput,
  type PackingCommand,
  type ReminderInput,
  type ReadinessResult,
} from "../lib/packing-documents";
const uuid = z.uuid(),
  stamp = z.object({ id: uuid, revision: z.number().int().nonnegative() });
const commandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), input: packingInput }),
  z.object({
    op: z.literal("list"),
    id: uuid,
    traveler: z.string().trim().min(1).max(100),
  }),
  stamp.extend({ op: z.literal("delete") }),
  stamp.extend({ op: z.literal("packed"), packed: z.boolean() }),
  stamp.extend({
    op: z.literal("delete-list"),
    items: z.array(stamp).max(1000),
  }),
  z.object({
    op: z.literal("reorder"),
    list_id: uuid,
    order: z.array(stamp).max(1000),
  }),
  z.object({ op: z.enum(["copy", "template"]), list_id: uuid, source: uuid }),
]);
export async function changePacking(
  trip: string,
  command: PackingCommand,
): Promise<ReadinessResult> {
  const parsed = commandSchema.safeParse(command);
  if (!uuid.safeParse(trip).success || !parsed.success)
    return {
      error: parsed.success
        ? "Trip unavailable."
        : parsed.error.issues[0].message,
    };
  const { db } = await access();
  const { data, error } = await db.rpc("change_packing", {
    target: trip,
    command: parsed.data,
  });
  if (error) return { error: readinessError(error) };
  revalidatePath("/");
  revalidatePath("/trips/" + trip);
  return data as ReadinessResult;
}
export async function changeReminder(
  trip: string,
  input: ReminderInput,
  remove = false,
): Promise<ReadinessResult> {
  const parsed = reminderInput.safeParse(input);
  if (!uuid.safeParse(trip).success || !parsed.success)
    return { error: "Check reminder name and date." };
  const { db } = await access();
  const { data, error } = await db.rpc("change_preparation_reminder", {
    target: trip,
    fields: parsed.data,
    remove,
  });
  if (error) return { error: readinessError(error) };
  revalidatePath("/");
  revalidatePath("/trips/" + trip);
  return { id: data, message: "Reminder saved in your trip." };
}
function readinessError(error: { code?: string; message: string }) {
  if (["PGRST202", "42703", "PGRST204"].includes(error.code || ""))
    return "These controls need reviewed database update 016. Your input is still here.";
  if (
    /changed|unavailable|permission|own saved|name|quantity/i.test(
      error.message,
    )
  )
    return error.message;
  return "Could not save. Your input is still here; reconnect and retry.";
}
