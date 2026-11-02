import { cookies } from "next/headers";
import { safeReturnPath } from "../../../lib/auth-redirect";
import { isGoogleUser } from "../../../lib/auth-user";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const jar = await cookies();
  const returnTo = safeReturnPath(jar.get("pfew_return_to")?.value);
  jar.delete("pfew_return_to");
  if (code) {
    const db = await supabase();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error && isGoogleUser(data.user))
      return NextResponse.redirect(new URL(returnTo || "/", request.url));
    if (!error) await db.auth.signOut();
  }
  return NextResponse.redirect(
    new URL(
      "/error?message=Google%20sign-in%20could%20not%20be%20completed.%20Please%20try%20again.",
      request.url,
    ),
  );
}
