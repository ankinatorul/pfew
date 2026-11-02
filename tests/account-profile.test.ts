import { it, expect } from "vitest";
import { accountProfile, googleAvatar } from "../lib/account-profile";
import type { User } from "@supabase/supabase-js";
const user = (
  metadata: Record<string, unknown>,
  identity: Record<string, unknown> = {},
) =>
  ({
    email: "traveler@example.com",
    user_metadata: metadata,
    identities: [{ provider: "google", identity_data: identity }],
  }) as Pick<User, "email" | "identities" | "user_metadata">;
it("uses Google identity details and returns only display fields", () => {
  const result = accountProfile(
    user(
      { full_name: "Different name", access_token: "never-send-this" },
      {
        name: "Anca Traveler",
        picture: "https://lh3.googleusercontent.com/a/photo",
      },
    ),
  );
  expect(result).toEqual({
    name: "Anca Traveler",
    email: "traveler@example.com",
    avatarUrl: "https://lh3.googleusercontent.com/a/photo",
    initials: "AT",
  });
  expect(JSON.stringify(result)).not.toContain("never-send-this");
});
it("falls back to Supabase Google metadata and initials when no photo exists", () => {
  expect(
    accountProfile(
      user({
        full_name: "Anca Traveler",
        avatar_url: "https://lh3.googleusercontent.com/a-/photo",
      }),
    ).avatarUrl,
  ).toBe("https://lh3.googleusercontent.com/a-/photo");
  expect(accountProfile(user({}))).toEqual({
    name: "traveler",
    email: "traveler@example.com",
    avatarUrl: null,
    initials: "T",
  });
});
it("rejects unsafe or third-party avatar URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "http://lh3.googleusercontent.com/a",
    "https://lh3.googleusercontent.com.evil.example/a",
    "https://other.example/avatar",
    "https://name:password@lh3.googleusercontent.com/a",
  ])
    expect(googleAvatar(url)).toBeNull();
});
