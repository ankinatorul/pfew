import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const db = await supabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(
    new URL(
      "/error?message=Sign-in%20link%20expired.%20Please%20try%20again.",
      request.url,
    ),
  );
}
