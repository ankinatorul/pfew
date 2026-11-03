import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(
    {
      release: "phase-4",
      schemaVersionRequired: 9,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      modules: [
        "bookings",
        "prep",
        "packing",
        "budget",
        "automatic-locations",
        "trip-check",
        "ideas",
        "places",
        "collaboration",
        "encrypted-offline",
        "booking-import",
        "official-research",
        "quick-add",
        "day-planning",
        "schedule-check",
        "packing-suggestions",
        "prep-suggestions",
        "budget-distribution",
        "adaptive-home",
        "trip-filters",
        "responsive-trip-navigation",
        "setup-checks",
        "trip-map-locations",
      ],
      configuration: {
        supabaseUrlPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        publishableKeyPresent: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        ),
        siteUrlPresent: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      },
      scope:
        "Release and effective public configuration presence only; database and authentication are not checked.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
