import { it, expect, vi } from "vitest";
import {
  fetchAuthProviders,
  inspectAuthProviders,
} from "../lib/auth-providers";
it("does not treat enabled email as enabled Google", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    Response.json({ external: { google: false, email: true } }),
  );
  expect(
    await fetchAuthProviders(
      "https://example.supabase.co",
      "test-public-key",
      fake,
    ),
  ).toEqual({ state: "ready", google: false });
  expect(fake.mock.calls[0][1]?.cache).toBe("no-store");
});
it("allows Google only when Supabase explicitly enables it", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    Response.json({ external: { google: true, email: true } }),
  );
  expect(
    (
      await fetchAuthProviders(
        "https://example.supabase.co",
        "test-public-key",
        fake,
      )
    ).google,
  ).toBe(true);
});
it("handles network failures, invalid responses and authorization errors honestly", async () => {
  const cases = [
    vi.fn<typeof fetch>(async () => {
      throw new Error("network");
    }),
    vi.fn<typeof fetch>(
      async () => new Response("unavailable", { status: 503 }),
    ),
    vi.fn<typeof fetch>(async () => Response.json({ unexpected: true })),
    vi.fn<typeof fetch>(async () => new Response("{}", { status: 401 })),
  ];
  for (const fake of cases)
    expect(
      await fetchAuthProviders(
        "https://example.supabase.co",
        "test-public-key",
        fake,
      ),
    ).toEqual({ state: "unavailable", google: false });
});

it("does not mislabel an omitted Google field as explicitly disabled", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    Response.json({ external: { email: true } }),
  );
  expect(
    await inspectAuthProviders(
      "https://example.supabase.co",
      "test-public-key",
      fake,
    ),
  ).toEqual({
    state: "unavailable",
    google: false,
    httpStatus: 200,
    reason: "unexpected_response",
  });
});
it("distinguishes an explicit disabled setting from API access errors", async () => {
  const disabled = vi.fn<typeof fetch>(async () =>
    Response.json({ external: { google: false } }),
  );
  const rejected = vi.fn<typeof fetch>(
    async () => new Response("{}", { status: 401 }),
  );
  expect(
    await inspectAuthProviders(
      "https://example.supabase.co",
      "test-public-key",
      disabled,
    ),
  ).toEqual({ state: "ready", google: false, httpStatus: 200, reason: null });
  expect(
    await inspectAuthProviders(
      "https://example.supabase.co",
      "test-public-key",
      rejected,
    ),
  ).toEqual({
    state: "unavailable",
    google: false,
    httpStatus: 401,
    reason: "http_error",
  });
});
