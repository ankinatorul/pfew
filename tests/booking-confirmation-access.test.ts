import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  google: vi.fn(),
  sign: vi.fn(),
  user: vi.fn(),
  record: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({
  configured: () => true,
  supabase: mocks.db,
}));
vi.mock("../lib/auth-user", () => ({ isGoogleUser: mocks.google }));
import { GET } from "../app/api/attachments/[id]/route";
const id = "88888888-8888-4888-8888-888888888888";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "owner" } } });
  mocks.google.mockReturnValue(true);
  mocks.record.mockResolvedValue({
    data: {
      id,
      path: "private/path",
      filename: "confirmation.pdf",
      state: "ready",
    },
  });
  mocks.sign.mockResolvedValue({
    data: { signedUrl: "https://storage.test/temporary-signed-download" },
    error: null,
  });
  mocks.db.mockResolvedValue({
    auth: { getUser: mocks.user },
    from: () => {
      const q = { select: () => q, eq: () => q, single: mocks.record };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
  });
});
it("requires authentication and makes no private download request for signed-out users", async () => {
  mocks.user.mockResolvedValue({ data: { user: null } });
  const response = await GET(
    new Request("http://localhost/api/attachments/" + id),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(401);
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.sign).not.toHaveBeenCalled();
});
it("returns unavailable when RLS hides another user’s file or an upload remains pending", async () => {
  for (const record of [null, { state: "pending" }]) {
    mocks.record.mockResolvedValue({ data: record });
    const response = await GET(
      new Request("http://localhost/api/attachments/" + id),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(404);
  }
  expect(mocks.sign).not.toHaveBeenCalled();
});
it("uses a 60-second authorized download and prevents caching; it does not publish the object", async () => {
  const response = await GET(
    new Request("http://localhost/api/attachments/" + id),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(302);
  expect(mocks.sign).toHaveBeenCalledWith("private/path", 60, {
    download: "confirmation.pdf",
  });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
});
