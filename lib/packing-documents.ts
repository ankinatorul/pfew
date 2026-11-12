import { z } from "zod";
import {
  prepCategories,
  type PackingItem,
  type PackingList,
  type Task,
} from "./essentials";
import { normalizedTitle } from "./readiness";
export const packingCategories = [
  "Clothing",
  "Personal care",
  "Electronics",
  "Documents",
  "Health & Essentials",
  "Accessories",
  "Other",
] as const;
export const documentCategories = [
  "Passport & ID",
  "Tickets",
  "Visas",
  "Insurance",
  "Reservations",
  "Other",
] as const;
export type ManagedPackingItem = PackingItem & {
  notes?: string;
  position?: number;
  packing_revision?: number;
};
export type ManagedPackingList = PackingList & { packing_revision?: number };
export type ReadinessTask = Task & { readiness_revision?: number };
export type TripFile = {
  id: string;
  trip_id: string;
  booking_id: string | null;
  intake_id?: string | null;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
  state: "pending" | "ready";
  document_kind?: "booking" | "trip";
  display_name?: string | null;
  document_category?: string;
  documents_hidden?: boolean;
  document_revision?: number;
};
export type ReadinessResult = {
  error?: string;
  message?: string;
  id?: string;
  file?: TripFile;
};
export const packingInput = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  list_id: z.uuid(),
  title: z.string().trim().min(1, "Give your item a name.").max(200),
  category: z
    .string()
    .trim()
    .max(100)
    .transform((v) => v || "Other"),
  quantity: z.coerce.number().int().min(1).max(1000),
  notes: z.string().max(1000),
});
export type PackingInput = z.infer<typeof packingInput>;
export type PackingCommand =
  | { op: "save"; input: PackingInput }
  | { op: "packed"; id: string; revision: number; packed: boolean }
  | { op: "delete"; id: string; revision: number }
  | { op: "list"; id: string; traveler: string }
  | {
      op: "delete-list";
      id: string;
      revision: number;
      items: { id: string; revision: number }[];
    }
  | {
      op: "reorder";
      list_id: string;
      order: { id: string; revision: number }[];
    }
  | { op: "copy"; list_id: string; source: string }
  | { op: "template"; list_id: string; source: string };
export const reminderInput = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  title: z.string().trim().min(1, "Give your reminder a name.").max(200),
  due_date: z.union([z.literal(""), z.iso.date()]),
  category: z.enum(prepCategories),
  done: z.boolean(),
});
export type ReminderInput = z.infer<typeof reminderInput>;
export function packingProgress(items: ManagedPackingItem[]) {
  const total = items.length,
    packed = items.filter((i) => i.packed).length;
  return {
    total,
    packed,
    remaining: total - packed,
    percent: total ? Math.round((packed / total) * 100) : 0,
  };
}
export function packingGroups(items: ManagedPackingItem[]) {
  const sorted = [...items].sort(
    (a, b) =>
      (a.position || 0) - (b.position || 0) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
  return [...new Set(sorted.map((i) => i.category || "Other"))].map(
    (category) => ({
      category,
      items: sorted.filter((i) => (i.category || "Other") === category),
    }),
  );
}
export function relevantReminders(
  tasks: ReadinessTask[],
  topic: "packing" | "documents",
) {
  return tasks.filter((t) =>
    topic === "documents"
      ? t.category === "Documents" ||
        /\b(passport|insurance|documents?)\b/i.test(t.title)
      : /\b(pack|packing|luggage)\b/i.test(t.title),
  );
}
export function newPackingDuplicate(
  title: string,
  items: ManagedPackingItem[],
) {
  return items.find((i) => normalizedTitle(i.title) === normalizedTitle(title));
}
export function fileLabel(file: TripFile) {
  return file.display_name || file.filename;
}
