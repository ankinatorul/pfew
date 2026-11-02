import { it, expect } from "vitest";
import { safeReturnPath, rootOAuthCallback } from "../lib/auth-redirect";
it("routes an OAuth code returned to the root to the local PKCE callback", () => {
  const code = "11111111-1111-4111-8111-111111111111";
  expect(rootOAuthCallback(code)).toBe("/auth/callback?code=" + code);
});
it("rejects missing, repeated, invalid and redirect-like values", () => {
  for (const code of [
    undefined,
    null,
    "",
    "https://other.example",
    ["11111111-1111-4111-8111-111111111111"],
    "../../other",
  ])
    expect(rootOAuthCallback(code)).toBeNull();
});

it("only permits local invitation return paths", () => {
  expect(safeReturnPath("/invites/" + "a".repeat(64))).toBe(
    "/invites/" + "a".repeat(64),
  );
  for (const value of [
    "//evil.example",
    "https://evil.example",
    "/profile",
    "/invites/" + "a".repeat(64) + "?next=evil",
  ])
    expect(safeReturnPath(value)).toBeNull();
});
