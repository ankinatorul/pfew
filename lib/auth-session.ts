import { cache } from "react";
import { supabase, configured } from "./supabase";
import { isGoogleUser } from "./auth-user";
// React cache is request-scoped: the header and protected page share verification.
export const currentGoogleUser = cache(async () => {
  if (!configured()) return null;
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  return !error && user && isGoogleUser(user) ? user : null;
});
