import { z } from "zod";
export function rootOAuthCallback(code: unknown) {
  const parsed = z.uuid().safeParse(code);
  return parsed.success
    ? "/auth/callback?" + new URLSearchParams({ code: parsed.data }).toString()
    : null;
}
