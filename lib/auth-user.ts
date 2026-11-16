import type { User } from "@supabase/supabase-js";
export function isGoogleUser(
  user: Pick<User, "identities"> | null | undefined,
) {
  return Boolean(
    user?.identities?.some((identity) => identity.provider === "google"),
  );
}

export function isPfewUser(
  user: Pick<User, "identities" | "email_confirmed_at"> | null | undefined,
) {
  return (
    isGoogleUser(user) ||
    Boolean(
      user?.email_confirmed_at &&
      user.identities?.some((identity) => identity.provider === "email"),
    )
  );
}
