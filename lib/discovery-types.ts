import { z } from "zod";
const httpsUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "HTTPS source required",
  );
export const placeSchema = z.object({
  id: z.string().min(1).max(300),
  name: z.string().max(300),
  address: z.string().max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  mapsUrl: httpsUrl,
  attributions: z.array(
    z.object({ provider: z.string(), url: httpsUrl.optional() }),
  ),
  checkedAt: z.iso.datetime(),
});
export type PlaceResult = z.infer<typeof placeSchema>;
