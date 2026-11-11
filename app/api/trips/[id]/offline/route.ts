import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "../../../../../lib/supabase";
import { isGoogleUser } from "../../../../../lib/auth-user";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new NextResponse("Unavailable", { status: 404 });
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !isGoogleUser(user))
    return new NextResponse("Sign in required", { status: 401 });
  const { data: trip, error } = await db
    .from("trips")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !trip || trip.creation_state === "draft")
    return new NextResponse("Trip unavailable", { status: 404 });
  const tables = [
    "trip_segments",
    "bookings",
    "prep_tasks",
    "packing_lists",
    "packing_items",
    "budget_allocations",
    "expenses",
  ] as const;
  const results = await Promise.all(
    tables.map((table) => db.from(table).select("*").eq("trip_id", id)),
  );
  if (results.some((result) => result.error))
    return new NextResponse("Download unavailable", { status: 503 });
  return NextResponse.json(
    {
      version: 1,
      userId: user.id,
      trip: { id: trip.id, name: trip.name, start_date: trip.start_date, end_date: trip.end_date, timezone: trip.timezone, currency: trip.currency, budget: trip.budget },
      downloadedAt: new Date().toISOString(),
      ...Object.fromEntries(
        tables.map((table, index) => [table, results[index].data]),
      ),
    },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  );
}
