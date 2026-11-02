import { z } from "zod";
import { placeSchema, type PlaceResult } from "./discovery-types";
const payload = z.object({
  places: z
    .array(
      z.object({
        id: z.string(),
        displayName: z.object({ text: z.string() }),
        formattedAddress: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }),
        googleMapsUri: z.url(),
        attributions: z
          .array(
            z.object({ provider: z.string(), providerUri: z.url().optional() }),
          )
          .optional(),
      }),
    )
    .default([]),
});
export async function googlePlaces(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key)
    throw new Error(
      "Place discovery is not configured for this deployment. You can still save cities and your own notes.",
    );
  const response = await fetcher(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.attributions",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 8 }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error(
      "Google place search is unavailable. Please try again later.",
    );
  return payload.parse(await response.json()).places.map((p) =>
    placeSchema.parse({
      id: p.id,
      name: p.displayName.text,
      address: p.formattedAddress || "",
      latitude: p.location.latitude,
      longitude: p.location.longitude,
      mapsUrl: p.googleMapsUri,
      attributions: (p.attributions || []).map((a) => ({
        provider: a.provider,
        url: a.providerUri,
      })),
      checkedAt: new Date().toISOString(),
    }),
  );
}
export async function googlePlaceDetails(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<PlaceResult> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Place discovery unavailable");
  const response = await fetcher(
    "https://places.googleapis.com/v1/places/" + encodeURIComponent(id),
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,googleMapsUri,attributions",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Place details unavailable");
  const p = payload.parse({ places: [await response.json()] }).places[0];
  return placeSchema.parse({
    id: p.id,
    name: p.displayName.text,
    address: p.formattedAddress || "",
    latitude: p.location.latitude,
    longitude: p.location.longitude,
    mapsUrl: p.googleMapsUri,
    attributions: (p.attributions || []).map((a) => ({
      provider: a.provider,
      url: a.providerUri,
    })),
    checkedAt: new Date().toISOString(),
  });
}
