import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(
    {
      release: "phase-2",
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      modules: ["bookings", "prep", "packing", "budget"],
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
