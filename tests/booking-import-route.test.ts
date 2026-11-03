import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: mocks.user }));
vi.mock("../lib/supabase", () => ({
  supabase: async () => ({ rpc: mocks.rpc }),
}));
import { POST } from "../app/api/booking-import/route";
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const request = (values: Record<string, string>) => {
  const form = new FormData();
  Object.entries({
    trip_id: "11111111-1111-4111-8111-111111111111",
    mode: "text",
    text: "Booking reference: ABC",
    ...values,
  }).forEach(([key, value]) => form.set(key, value));
  return new Request("http://localhost/api/booking-import", {
    method: "POST",
    body: form,
  });
};
it("requires sign-in and editing access before reading a source", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(request({}))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue({ id: "viewer" });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect((await POST(request({}))).status).toBe(403);
});
it("returns a no-store private preview without persisting a booking or charging a provider", async () => {
  mocks.user.mockResolvedValue({ id: "editor" });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const response = await POST(request({}));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const preview = await response.json();
  expect(preview.fields.reference).toBe("ABC");
  expect(preview.fields.paid_amount).toBeNull();
  expect(preview.method).toBe("text");
  expect(preview.importKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual([
    "can_edit_trip",
  ]);
});
it("requires deliberate consent and configured live AI before reserving budget", async () => {
  mocks.user.mockResolvedValue({ id: "editor" });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  vi.stubEnv("AI_MODE", "live");
  vi.stubEnv("AI_API_KEY", "");
  expect((await POST(request({ mode: "ai" }))).status).toBe(400);
  expect((await POST(request({ mode: "ai", consent: "yes" }))).status).toBe(
    400,
  );
  expect(
    mocks.rpc.mock.calls.every((call) => call[0] === "can_edit_trip"),
  ).toBe(true);
});
