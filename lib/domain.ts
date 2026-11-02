import { z } from "zod";
export const tripSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(120)
      .transform((v) => v || "Untitled adventure"),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid IANA time zone"),
    travelers: z.coerce.number().int().min(1).max(100),
    style: z.enum(["Budget", "Comfort", "Luxury"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    budget: z.preprocess(
      (v) => (v === "" || v === null ? null : v),
      z.coerce.number().nonnegative().nullable(),
    ),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date must follow start date",
    path: ["end_date"],
  });
export const segmentSchema = z
  .object({
    trip_id: z.uuid(),
    destination_id: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.uuid().nullable(),
    ),
    kind: z.enum(["destination", "stay", "transport", "activity", "note"]),
    title: z.string().trim().min(1).max(200),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    local_time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    status: z.enum(["planned", "confirmed", "idea"]),
    notes: z.string().max(4000),
    address: z.string().max(500).default(""),
    provider: z.string().max(200).default(""),
    reference: z.string().max(200).default(""),
    origin: z.string().max(500).default(""),
    arrival_location: z.string().max(500).default(""),
    arrival_time: z
      .union([z.literal(""), z.iso.time({ precision: -1 })])
      .default(""),
    arrival_timezone: z
      .string()
      .refine((v) => {
        if (!v) return true;
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      })
      .default(""),
    transport_mode: z
      .enum([
        "",
        "flight",
        "train",
        "ferry",
        "transfer",
        "rental car",
        "bus",
        "other",
      ])
      .default(""),
    position: z.coerce.number().int().nonnegative().default(0),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date must follow start date",
  });
export function days(start: string, end: string) {
  const out: string[] = [];
  for (
    let d = new Date(start + "T12:00:00Z");
    d <= new Date(end + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length >= 730) break;
  }
  return out;
}
export function lifecycle(
  start: string,
  end: string,
  zone: string,
  now = new Date(),
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return today < start ? "upcoming" : today > end ? "past" : "traveling";
}
export type Trip = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  travelers: number;
  style: string;
  currency: string;
  budget: number | null;
};
export type Segment = {
  id: string;
  trip_id: string;
  kind: string;
  title: string;
  start_date: string;
  end_date: string;
  local_time: string;
  timezone: string;
  status: string;
  notes: string;
  address: string;
  provider: string;
  reference: string;
  origin: string;
  arrival_location: string;
  arrival_time: string;
  arrival_timezone: string;
  transport_mode: string;
  position: number;
  destination_id: string | null;
};

export const destinationSchema = z
  .object({
    title: z.string().trim().min(1, "Give each destination a name").max(200),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid destination time zone"),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "Destination end date must follow its start date",
  });
export function parseDestinations(form: FormData, start: string, end: string) {
  const names = form.getAll("destination_name");
  const result = z
    .array(destinationSchema)
    .max(32)
    .parse(
      names.map((title, i) => ({
        title,
        start_date: form.getAll("destination_start")[i],
        end_date: form.getAll("destination_end")[i],
        timezone: form.getAll("destination_timezone")[i],
      })),
    );
  if (result.some((d) => d.start_date < start || d.end_date > end))
    throw new Error("Destination dates must be within the trip.");
  return result;
}
export function validationMessage(error: unknown) {
  return error instanceof z.ZodError
    ? error.issues.map((i) => i.message).join(". ")
    : error instanceof Error
      ? error.message
      : "Please check your details.";
}

export function nextTrip(trips: Trip[], now = new Date()) {
  const ordered = [...trips].sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  return (
    ordered.find(
      (t) =>
        lifecycle(t.start_date, t.end_date, t.timezone, now) === "traveling",
    ) ||
    ordered.find(
      (t) =>
        lifecycle(t.start_date, t.end_date, t.timezone, now) === "upcoming",
    ) ||
    null
  );
}
export function departureCountdown(trip: Trip, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: trip.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Math.max(
    0,
    Math.round((Date.parse(trip.start_date) - Date.parse(today)) / 86400000),
  );
}
