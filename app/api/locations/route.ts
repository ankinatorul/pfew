import { NextResponse } from "next/server";
import { z } from "zod";
import { searchWorldwideLocations } from "../../../lib/worldwide-locations";
import {
  coordinatesFromInput,
  geographicLocation,
} from "../../../lib/geographic-location";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  if (q.trim().length < 2 || q.length > 100)
    return NextResponse.json(
      { results: [] },
      { status: q.length > 100 ? 400 : 200 },
    );
  const result = await searchWorldwideLocations(q);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": result.worldwideAvailable
        ? "public, max-age=3600"
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
