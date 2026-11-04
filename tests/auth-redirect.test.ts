import { it, expect } from "vitest";
import {
  safeReturnPath,
  rootOAuthCallback,
  authRedirectOrigin,
} from "../lib/auth-redirect";
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

it("uses the configured browser origin for local and production OAuth redirects", () => {
  expect(
    authRedirectOrigin(
      "http://0.0.0.0:3000/auth/callback",
      "http://localhost:3000",
    ),
  ).toBe("http://localhost:3000");
  expect(
    authRedirectOrigin(
      "http://0.0.0.0:3000/auth/callback",
      "https://pfew.vercel.app",
    ),
  ).toBe("https://pfew.vercel.app");
  expect(
    authRedirectOrigin(
      "http://localhost:3000/auth/callback",
      "http://localhost:3000/path",
    ),
  ).toBe("http://localhost:3000");
});
it("never uses a wildcard listener or a non-web configured URL for redirects", () => {
  expect(authRedirectOrigin("http://0.0.0.0:3000/auth/callback")).toBe(
    "http://localhost:3000",
  );
  expect(
    authRedirectOrigin("http://[::]:3000/auth/callback", "http://0.0.0.0:3000"),
  ).toBe("http://localhost:3000");
  expect(
    authRedirectOrigin(
      "http://localhost:3000/auth/callback",
      "javascript:alert(1)",
    ),
  ).toBe("http://localhost:3000");
});
