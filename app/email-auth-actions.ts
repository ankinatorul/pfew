"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { authProviders } from "../lib/auth-providers";
import { safeReturnPath } from "../lib/auth-redirect";
export type EmailLinkState = { message?: string; error?: string };
export async function requestEmailLink(
  _previous: EmailLinkState,
  form: FormData,
): Promise<EmailLinkState> {
  const email = z.string().trim().email().max(254).safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const providers = await authProviders();
  if (providers.state !== "ready" || !providers.email)
    return {
      error:
        "Email sign-in isn’t available. Continue with Google if it’s enabled.",
    };
  const next = safeReturnPath(form.get("next")),
    jar = await cookies();
  if (next)
    jar.set("pfew_return_to", next, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  else jar.delete("pfew_return_to");
  const db = await supabase();
  try {
    const { error } = await db.auth.signInWithOtp({
      email: email.data,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: new URL(
          "/auth/callback",
          process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        ).href,
      },
    });
    // Do not disclose account existence. Delivery/configuration still needs real
    // operator verification; successful API calls do not prove inbox delivery.
    if (error && !/signups? not allowed|user not found/i.test(error.message))
      return {
        error:
          "We couldn’t request a sign-in link. Try again later or continue with Google.",
      };
    return {
      message:
        "If this account can receive a sign-in link, check your inbox. Open it in this browser.",
    };
  } catch {
    return {
      error:
        "We couldn’t confirm the request. Try again later or continue with Google.",
    };
  }
}
