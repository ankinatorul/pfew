import { z } from "zod";
export const budgetDistributionSchema = z
  .object({
    amount: z
      .string()
      .regex(
        /^\d{1,10}(?:\.\d{1,2})?$/,
        "Enter an amount with up to two decimal places.",
      ),
    categories: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          weight: z.coerce.number().int().min(0).max(100),
        }),
      )
      .min(1)
      .max(8),
    days: z
      .array(
        z.object({
          day: z.iso.date(),
          weight: z.coerce.number().int().min(0).max(20),
        }),
      )
      .min(1)
      .max(60),
  })
  .refine(
    (value) =>
      value.categories.reduce((sum, item) => sum + item.weight, 0) === 100,
    "Category percentages must add up to 100.",
  )
  .refine(
    (value) => value.days.some((day) => day.weight > 0),
    "Give at least one day a positive weight.",
  )
  .refine(
    (value) =>
      new Set(value.days.map((item) => item.day)).size === value.days.length,
    "Choose each day once.",
  )
  .refine(
    (value) =>
      new Set(value.categories.map((item) => item.name.toLowerCase())).size ===
      value.categories.length,
    "Use different category names.",
  );
export type BudgetDistributionInput = z.infer<typeof budgetDistributionSchema>;
export function moneyCents(value: string) {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents < 1n || cents > 999999999900n)
    throw new Error("Choose an amount between 0.01 and 9,999,999,999.");
  return cents;
}
export function distributeBudget(raw: BudgetDistributionInput) {
  const input = budgetDistributionSchema.parse(raw),
    total = moneyCents(input.amount);
  const rows = input.days
    .filter((day) => day.weight > 0)
    .sort((a, b) => a.day.localeCompare(b.day))
    .flatMap((day) =>
      input.categories
        .filter((category) => category.weight > 0)
        .map((category) => ({
          day: day.day,
          category: category.name,
          weight: BigInt(day.weight * category.weight),
          cents: 0n,
          remainder: 0n,
        })),
    );
  const denominator = rows.reduce((sum, row) => sum + row.weight, 0n);
  for (const row of rows) {
    const weighted = total * row.weight;
    row.cents = weighted / denominator;
    row.remainder = weighted % denominator;
  }
  let remaining = total - rows.reduce((sum, row) => sum + row.cents, 0n);
  const ordered = [...rows].sort((a, b) =>
    a.remainder > b.remainder
      ? -1
      : a.remainder < b.remainder
        ? 1
        : a.day.localeCompare(b.day) || a.category.localeCompare(b.category),
  );
  for (const row of ordered) {
    if (remaining <= 0n) break;
    row.cents += 1n;
    remaining -= 1n;
  }
  return rows
    .filter((row) => row.cents > 0n)
    .map(({ day, category, cents }) => ({
      day,
      category,
      planned: Number(cents) / 100,
      cents: Number(cents),
    }));
}
