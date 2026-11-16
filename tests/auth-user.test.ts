import { it, expect } from "vitest";
import { isGoogleUser } from "../lib/auth-user";
import type { User } from "@supabase/supabase-js";
it("requires a Google identity for access to the application", () => {
  const user = (provider: string) =>
    ({ identities: [{ provider }] }) as Pick<User, "identities">;
  expect(isGoogleUser(user("google"))).toBe(true);
  expect(isGoogleUser(user("email"))).toBe(false);
  expect(isGoogleUser(user("github"))).toBe(false);
  expect(isGoogleUser(null)).toBe(false);
  expect(isGoogleUser({ identities: [] })).toBe(false);
});
import { isPfewUser } from "../lib/auth-user";
it("accepts existing verified email sessions without treating unverified/unsupported identities as members", () => {
  expect(
    isPfewUser({
      identities: [{ provider: "email" }],
      email_confirmed_at: "2026-01-01",
    } as User),
  ).toBe(true);
  expect(isPfewUser({ identities: [{ provider: "email" }] } as User)).toBe(
    false,
  );
  expect(
    isPfewUser({
      identities: [{ provider: "github" }],
      email_confirmed_at: "2026-01-01",
    } as User),
  ).toBe(false);
});
