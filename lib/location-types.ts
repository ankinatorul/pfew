import { z } from "zod";
export const resolvedLocationSchema = z.object({
  id: z.string().max(2048),
  label: z.string().max(500),
  city: z.string().max(200),
  country: z.string().max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().max(100),
  source: z.enum(["city-timezones", "coordinates"]),
});
export type ResolvedLocation = z.infer<typeof resolvedLocationSchema>;
