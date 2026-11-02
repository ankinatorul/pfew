import { NextResponse } from "next/server";
import { searchLocations } from "../../../lib/locations";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  if (q.length < 2 || q.length > 100)
    return NextResponse.json(
      { results: [] },
      { status: q.length > 100 ? 400 : 200 },
    );
  return NextResponse.json(
    { results: searchLocations(q) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
