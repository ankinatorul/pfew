import { z } from "zod";
const settingsSchema = z.object({
  external: z.object({
    google: z.boolean().default(false),
  }),
});
export type AuthProviders =
  { state: "ready"; google: boolean } | { state: "unavailable"; google: false };
const unavailable: AuthProviders = {
  state: "unavailable",
  google: false,
};
export async function fetchAuthProviders(
  url: string,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<AuthProviders> {
  if (!url || !key) return unavailable;
  try {
    const response = await fetcher(new URL("/auth/v1/settings", url), {
      headers: { apikey: key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return unavailable;
    const parsed = settingsSchema.safeParse(await response.json());
    if (!parsed.success) return unavailable;
    return {
      state: "ready",
      google: parsed.data.external.google,
    };
  } catch {
    return unavailable;
  }
}
export async function authProviders() {
  return fetchAuthProviders(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  );
}
