import { NextResponse } from "next/server";
import { z } from "zod";
import { searchWorldwideLocations } from "../../../lib/worldwide-locations";
import {
  canSearchLocation,
  locationQuery,
  LOCATION_QUERY_LIMIT,
} from "../../../lib/location-search";
import {
  coordinatesFromInput,
  geographicLocation,
} from "../../../lib/geographic-location";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = locationQuery(params.get("q") || "");
  const scope = params.get("scope") || "place";
  if (scope !== "destination" && scope !== "place")
    return NextResponse.json(
      { error: "Choose a valid location search scope." },
      { status: 400 },
    );
  if (!canSearchLocation(q))
    return NextResponse.json(
      { results: [] },
      { status: q.length > LOCATION_QUERY_LIMIT ? 400 : 200 },
    );
  const mode = params.get("booking");
  const options = z
    .object({
      kind: z.enum(["Stay", "Experience"]),
      centers: z
        .array(
          z.object({
            latitude: z.number().finite().min(-90).max(90),
            longitude: z.number().finite().min(-180).max(180),
          }),
        )
        .max(3),
    })
    .safeParse(
      mode
        ? {
            kind: mode,
            centers: (() => {
              try {
                return JSON.parse(params.get("near") || "[]");
              } catch {
                return null;
              }
            })(),
          }
        : null,
    );
  if (mode && (!options.success || scope !== "place"))
    return NextResponse.json(
      { error: "Invalid place search context." },
      { status: 400 },
    );
  const result = await searchWorldwideLocations(
    q,
    fetch,
    scope,
    options.success ? options.data : undefined,
  );
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": mode
        ? "private, no-store"
        : result.worldwideAvailable
          ? result.results.length
            ? "public, max-age=300"
            : "public, max-age=30"
          : "no-store",
    },
  });
}
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 3000)
    return NextResponse.json(
      { error: "This location is too long." },
      { status: 413 },
    );
  const schema = z.object({
    name: z.string().trim().min(1).max(200),
    position: z.string().trim().min(1).max(1500),
  });
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json(
      { error: "Enter a place name and its coordinates or map link." },
      { status: 400 },
    );
  }
  const point = coordinatesFromInput(body.position);
  if (!point)
    return NextResponse.json(
      {
        error:
          "Use latitude, longitude (for example 9.73, 100.01), or a full map link containing a selected pin’s coordinates. Short links and map-view centers cannot identify a place.",
      },
      { status: 400 },
    );
  return NextResponse.json(
    { location: geographicLocation(body.name, "", ...point) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
