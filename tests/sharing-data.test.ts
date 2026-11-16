import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSharingData } from "../lib/sharing-data";
import { overviewTrip as trip } from "./fixtures/trip-overview";
function client(owner = true) {
  const reads: string[] = [];
  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
  const from = vi.fn((table: string) => {
    reads.push(table);
    const response = {
      data:
        table === "trip_members"
          ? [
              {
                id: "member",
                user_id: owner ? "editor" : "owner",
                role: "editor",
                member_revision: 2,
              },
            ]
          : [
              {
                id: "accepted",
                email: "editor@example.com",
                accepted_by: "editor",
                accepted_at: "2026-01-01",
              },
              {
                id: "pending",
                email: "friend@example.com",
                expires_at: "2099-01-01",
              },
              {
                id: "expired",
                email: "old@example.com",
                expires_at: "2000-01-01",
              },
            ],
      error: null,
    };
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      is: vi.fn(() => q),
      order: vi.fn(() => q),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(response).then(resolve),
    };
    return q;
  });
  return { db: { rpc, from } as unknown as SupabaseClient, rpc, from, reads };
}
it("owner receives friendly member labels and pending records without selecting token hashes", async () => {
  const c = client();
  const result = await loadSharingData(c.db, trip, "owner");
  expect(result.ready).toBe(true);
  expect(result.members[0].label).toBe("editor@example.com");
  expect(result.pending).toEqual([
    { id: "pending", email: "friend@example.com", expires_at: "2099-01-01" },
  ]);
  for (const r of c.from.mock.results) {
    expect(r.value.select.mock.calls[0][0]).not.toContain("token");
  }
});
it("non-owner never requests private invitation emails, drafts never call sharing RPC", async () => {
  const c = client(false);
  await loadSharingData(c.db, trip, "editor");
  expect(c.reads).toEqual(["trip_members"]);
  c.rpc.mockClear();
  await loadSharingData(c.db, { ...trip, creation_state: "draft" }, "owner");
  expect(c.rpc).not.toHaveBeenCalled();
});
it("absent migration returns unavailable without querying new columns", async () => {
  const c = client();
  c.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  const result = await loadSharingData(c.db, trip, "owner");
  expect(result.ready).toBe(false);
  expect(c.from).not.toHaveBeenCalled();
});
