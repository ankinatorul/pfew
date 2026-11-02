import type { User } from "@supabase/supabase-js";
export type AccountProfile = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  initials: string;
};
function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
export function googleAvatar(value: unknown) {
  const source = string(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    return url.protocol === "https:" &&
      /^lh\d+\.googleusercontent\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function accountProfile(
  user: Pick<User, "email" | "identities" | "user_metadata">,
): AccountProfile {
  const google =
    user.identities?.find((i) => i.provider === "google")?.identity_data || {};
  const meta = user.user_metadata || {};
  const name = (
    string(google.full_name) ||
    string(google.name) ||
    string(meta.full_name) ||
    string(meta.name) ||
    user.email?.split("@")[0] ||
    "Traveler"
  ).slice(0, 120);
  return {
    name,
    email: user.email || null,
    avatarUrl:
      googleAvatar(google.avatar_url) ||
      googleAvatar(google.picture) ||
      googleAvatar(meta.avatar_url) ||
      googleAvatar(meta.picture),
    initials: name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join("")
      .toUpperCase(),
  };
}
