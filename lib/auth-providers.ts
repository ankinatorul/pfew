import { z } from "zod";
const settingsSchema = z.object({
  external: z.object({ google: z.boolean() }),
});
export type AuthProviders =
  { state: "ready"; google: boolean } | { state: "unavailable"; google: false };
type Inspection = AuthProviders & {
  httpStatus: number | null;
  reason:
    | null
    | "missing_configuration"
    | "http_error"
    | "unexpected_response"
    | "network_or_timeout";
};
export async function inspectAuthProviders(
  url: string,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<Inspection> {
  const failure = (
    reason: Inspection["reason"],
    httpStatus: number | null = null,
  ): Inspection => ({
    state: "unavailable",
    google: false,
    httpStatus,
    reason,
  });
  if (!url || !key) return failure("missing_configuration");
  try {
    const response = await fetcher(new URL("/auth/v1/settings", url), {
      headers: { apikey: key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return failure("http_error", response.status);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return failure("unexpected_response", response.status);
    }
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) return failure("unexpected_response", response.status);
    return {
      state: "ready",
      google: parsed.data.external.google,
      httpStatus: response.status,
      reason: null,
    };
  } catch {
    return failure("network_or_timeout");
  }
}
export async function fetchAuthProviders(
  url: string,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<AuthProviders> {
  const { state, google } = await inspectAuthProviders(url, key, fetcher);
  return state === "ready"
    ? { state, google }
    : { state: "unavailable", google: false };
}
export async function authProviders() {
  return fetchAuthProviders(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  );
}
export async function authProviderDiagnostics() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let projectHost: string | null = null;
  try {
    projectHost = new URL(url).hostname;
  } catch {}
  const result = await inspectAuthProviders(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  );
  return {
    projectHost,
    callbackUrl: (() => {
      try {
        return new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL || "")
          .href;
      } catch {
        return null;
      }
    })(),
    google:
      result.state === "ready"
        ? result.google
          ? "enabled"
          : "disabled"
        : "unknown",
    httpStatus: result.httpStatus,
    reason: result.reason,
    checkedAt: new Date().toISOString(),
  };
}
