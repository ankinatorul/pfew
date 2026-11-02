import type { User } from "@supabase/supabase-js";
export function isGoogleUser(
  user: Pick<User, "identities"> | null | undefined,
) {
  return Boolean(
    user?.identities?.some((identity) => identity.provider === "google"),
  );
}
