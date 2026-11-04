import { z } from "zod";
export function rootOAuthCallback(code: unknown) {
  const parsed = z.uuid().safeParse(code);
  return parsed.success
    ? "/auth/callback?" + new URLSearchParams({ code: parsed.data }).toString()
    : null;
}
export function safeReturnPath(value: unknown) {
  return typeof value === "string" && /^\/invites\/[a-f0-9]{64}$/.test(value)
    ? value
    : null;
}

/** OAuth must return to the configured browser origin, not a wildcard bind host. */
export function authRedirectOrigin(requestUrl: string, siteUrl?: string) {
  if (siteUrl) {
    try {
      const configured = new URL(siteUrl);
      if (
        ["http:", "https:"].includes(configured.protocol) &&
        !configured.username &&
        !configured.password &&
        !["0.0.0.0", "[::]"].includes(configured.hostname)
      )
        return configured.origin;
    } catch {
      /* Fall back to the current request when no site origin is configured. */
    }
  }
  const incoming = new URL(requestUrl);
  if (["0.0.0.0", "[::]"].includes(incoming.hostname))
    incoming.hostname = "localhost";
  return incoming.origin;
}
