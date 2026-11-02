import { isGoogleUser } from "../../../lib/auth-user";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const db = await supabase();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error && isGoogleUser(data.user))
      return NextResponse.redirect(new URL("/", request.url));
    if (!error) await db.auth.signOut();
  }
  return NextResponse.redirect(
    new URL(
      "/error?message=Google%20sign-in%20could%20not%20be%20completed.%20Please%20try%20again.",
      request.url,
    ),
  );
}
