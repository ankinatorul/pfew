import { NextResponse } from "next/server";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { authProviderDiagnostics } from "../../../lib/auth-providers";
import { runSetupChecks } from "../../../lib/setup-checks";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const user = await currentGoogleUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in with Google to run your account checks." },
      { status: 401, headers },
    );
  try {
    const db = await supabase();
    const report = await runSetupChecks({
      db,
      userId: user.id,
      includeDocument:
        new URL(request.url).searchParams.get("document") === "1",
      inspectGoogle: authProviderDiagnostics,
      configuration: {
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "",
        projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        ai: process.env.AI_MODE === "live" && !!process.env.AI_API_KEY,
        places: !!process.env.GOOGLE_PLACES_API_KEY,
        maps: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
        commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      },
    });
    return NextResponse.json(report, { headers });
  } catch {
    return NextResponse.json(
      {
        error: "The checks could not finish. Check your connection and retry.",
      },
      { status: 503, headers },
    );
  }
}
