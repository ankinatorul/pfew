import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  providers: vi.fn(),
  otp: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../lib/auth-providers", () => ({ authProviders: mocks.providers }));
vi.mock("../lib/supabase", () => ({
  supabase: async () => ({ auth: { signInWithOtp: mocks.otp } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.remove }),
}));
import { requestEmailLink } from "../app/email-auth-actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.providers.mockResolvedValue({
    state: "ready",
    google: true,
    email: true,
  });
  mocks.otp.mockResolvedValue({ error: null });
});
const form = () => {
  const f = new FormData();
  f.set("email", "friend@example.com");
  f.set("next", "/invites/" + "a".repeat(64));
  return f;
};
it("requests an existing-account link only when enabled and preserves invitation return path", async () => {
  const result = await requestEmailLink({}, form());
  expect(result.message).toContain("If this account");
  expect(mocks.otp).toHaveBeenCalledWith({
    email: "friend@example.com",
    options: {
      shouldCreateUser: false,
      emailRedirectTo: expect.stringMatching(/\/auth\/callback$/),
    },
  });
  expect(mocks.set).toHaveBeenCalledWith(
    "pfew_return_to",
    "/invites/" + "a".repeat(64),
    expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
  );
});
it("unknown/disabled provider makes no email request", async () => {
  for (const providers of [
    { state: "unavailable", google: false },
    { state: "ready", google: true, email: false },
  ]) {
    mocks.providers.mockResolvedValue(providers);
    expect((await requestEmailLink({}, form())).error).toContain(
      "isn’t available",
    );
  }
  expect(mocks.otp).not.toHaveBeenCalled();
});
it("does not disclose unknown accounts; provider/network errors stay recoverable", async () => {
  mocks.otp.mockResolvedValueOnce({
    error: { message: "Signups not allowed" },
  });
  expect((await requestEmailLink({}, form())).message).toContain(
    "If this account",
  );
  mocks.otp.mockResolvedValueOnce({ error: { message: "rate limited" } });
  expect((await requestEmailLink({}, form())).error).toContain("Google");
  mocks.otp.mockRejectedValueOnce(new Error("network"));
  expect((await requestEmailLink({}, form())).error).toContain("confirm");
});
it("rejects invalid emails and never stores an external return URL", async () => {
  const f = form();
  f.set("email", "invalid");
  expect((await requestEmailLink({}, f)).error).toContain("valid email");
  expect(mocks.otp).not.toHaveBeenCalled();
  f.set("email", "friend@example.com");
  f.set("next", "https://example.com");
  await requestEmailLink({}, f);
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalledWith("pfew_return_to");
});
