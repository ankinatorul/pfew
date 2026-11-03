import { z } from "zod";
import { prepCategories } from "./essentials";
export const normalizedTitle = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export const packingCandidateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  quantity: z.coerce.number().int().min(1).max(1000),
  reason: z.string().max(500),
});
export type PackingCandidate = z.infer<typeof packingCandidateSchema>;
export const prepCandidateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(prepCategories),
  due_date: z.union([z.literal(""), z.iso.date()]),
  priority: z.enum(["low", "normal", "high"]),
  reason: z.string().max(500),
});
export type PrepCandidate = z.infer<typeof prepCandidateSchema>;
export type ReadinessContext = {
  days: number;
  destinations: string[];
  transportModes: string[];
  hasBookings: boolean;
};
export function packingStarter(
  context: ReadinessContext,
  clothingDays: number,
): PackingCandidate[] {
  if (!Number.isInteger(clothingDays) || clothingDays < 1 || clothingDays > 30)
    throw new Error("Choose 1 to 30 days of clothing.");
  const suggestions: PackingCandidate[] = [
    {
      title: "Travel documents you plan to use",
      category: "Documents",
      quantity: 1,
      reason:
        "A reminder to bring the documents you have checked for your own journey; no entry requirement is inferred.",
    },
    {
      title: "Charging cable",
      category: "Electronics",
      quantity: 1,
      reason: "Adjust for the devices you actually bring.",
    },
    {
      title: "Everyday clothing",
      category: "Clothing",
      quantity: clothingDays,
      reason: `You chose ${clothingDays} days of clothing for this list. Adjust for your own laundry plans and luggage.`,
    },
    {
      title: "Underwear",
      category: "Clothing",
      quantity: clothingDays,
      reason:
        "One per clothing day you chose; change the quantity before adding if needed.",
    },
    {
      title: "Personal care essentials",
      category: "Personal care",
      quantity: 1,
      reason: "Choose the products and quantities you normally use.",
    },
  ];
  if (context.transportModes.includes("flight"))
    suggestions.push({
      title: "Small essentials for your flight",
      category: "Journey",
      quantity: 1,
      reason:
        "Choose what you want within reach; check the airline’s actual baggage and item rules separately.",
    });
  return suggestions;
}
export function prepStarter(context: ReadinessContext): PrepCandidate[] {
  const task = (
    title: string,
    category: PrepCandidate["category"],
    reason: string,
  ): PrepCandidate => ({
    title,
    category,
    due_date: "",
    priority: "normal",
    reason,
  });
  return [
    task(
      "Review your travel documents",
      "Documents",
      "Check your own documents and validity against official guidance for your nationality and route.",
    ),
    ...(context.destinations.length
      ? [
          task(
            "Review official entry guidance",
            "Entry requirements",
            "Use Research to check guidance applicable to your document, nationality, purpose and dates. This does not mean a visa or form is required.",
          ),
        ]
      : []),
    task(
      "Review your travel insurance cover",
      "Health and insurance",
      "Check your existing cover and decide whether you need any changes.",
    ),
    ...(context.transportModes.includes("flight")
      ? [
          task(
            "Check your booked baggage allowance",
            "Transportation",
            "Use the allowance from your airline and fare; no allowance is assumed here.",
          ),
        ]
      : []),
    ...(context.hasBookings
      ? [
          task(
            "Keep your booking details accessible",
            "Accommodation",
            "Review saved references and consider an explicit encrypted offline download.",
          ),
        ]
      : [
          task(
            "Add the bookings you want handy",
            "Other",
            "Only add information you actually have; an empty wallet does not mean nothing is arranged.",
          ),
        ]),
  ];
}
export function withoutExisting<T extends { title: string }>(
  suggestions: T[],
  existing: { title: string }[],
) {
  const seen = new Set(existing.map((item) => normalizedTitle(item.title)));
  return suggestions.filter((item) => {
    const key = normalizedTitle(item.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export type AdditionState = {
  error?: string;
  added?: number;
  skipped?: number;
};
