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
