import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  supabase: vi.fn(),
  refresh: vi.fn(),
  removed: vi.fn(),
}));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: mocks.user }));
vi.mock("../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { POST } from "../app/api/trip-documents/route";
const owner = "11111111-1111-4111-8111-111111111111",
  trip = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
let rows: Map<string, Record<string, unknown>>,
  objects: Map<string, Blob>,
  failReady: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  objects = new Map();
  failReady = false;
  mocks.user.mockResolvedValue({ id: owner });
  mocks.supabase.mockResolvedValue({
    from: () => {
      const filters: Record<string, unknown> = {};
      let projection = "*";
      let inserted: Record<string, unknown> | null = null,
        updated: Record<string, unknown> | null = null,
        deleting = false;
      const result = () => {
        let row =
          inserted ||
          [...rows.values()].find((r) =>
            Object.entries(filters).every(([k, v]) => r[k] === v),
          ) ||
          null;
        if (inserted) {
          row = {
            ...inserted,
            created_at: "2026-11-12T00:00:00Z",
            document_revision: 0,
            documents_hidden: false,
          };
          rows.set(String(row.id), row);
        }
        if (updated && row) {
          if (failReady && updated.state === "ready")
            return { data: null, error: { message: "metadata failure" } };
          row = {
            ...row,
            ...updated,
            document_revision: Number(row.document_revision) + 1,
          };
          rows.set(String(row.id), row);
        }
        if (deleting && row) {
          rows.delete(String(row.id));
        }
        return {
          data:
            row && projection !== "*"
              ? Object.fromEntries(
                  projection.split(",").map((k) => [k, row![k]]),
                )
              : row,
          error: null,
        };
      };
      const q = {
        select: (fields = "*") => {
          projection = fields;
          return q;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        maybeSingle: async () => result(),
        single: async () => result(),
        insert: (v: Record<string, unknown>) => {
          inserted = v;
          return q;
        },
        update: (v: Record<string, unknown>) => {
          updated = v;
          return q;
        },
        delete: () => {
          deleting = true;
          return q;
        },
      };
      return q;
    },
    rpc: vi.fn(async (_name: string, input: Record<string, unknown>) => {
      const row = rows.get(String(input.document));
      if (!row || row.owner_id !== owner)
        return { error: { message: "Private document unavailable" } };
      if (row.document_revision !== input.expected_revision)
        return { error: { message: "Document changed" } };
      Object.assign(row, {
        display_name: input.label,
        document_category: input.category,
        documents_hidden: input.hidden,
        document_revision: Number(row.document_revision) + 1,
      });
      return { error: null };
    }),
    storage: {
      from: () => ({
        download: vi.fn(async (path: string) =>
          objects.has(path)
            ? { data: objects.get(path), error: null }
            : { data: null, error: { message: "missing" } },
        ),
        upload: vi.fn(async (path: string, bytes: Uint8Array) => {
          objects.set(path, new Blob([new Uint8Array(bytes)]));
          return { error: null };
        }),
        remove: mocks.removed.mockImplementation(async (paths: string[]) => {
          paths.forEach((p) => objects.delete(p));
          return { error: null };
        }),
      }),
    },
  });
});
function upload(content = "%PDF-1.4\nfixture", type = "application/pdf") {
  const form = new FormData();
  form.set("trip_id", trip);
  form.set("id", id);
  form.set("action", "upload");
  form.set("category", "Insurance");
  form.set("label", "My insurance");
  form.set("file", new File([content], "policy.pdf", { type }));
  return new Request("http://localhost/api/trip-documents", {
    method: "POST",
    body: form,
  });
}
function json(body: Record<string, unknown>) {
  return new Request("http://localhost/api/trip-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trip_id: trip, id, ...body }),
  });
}
it("requires sign-in, validates file contents and size before any upload reservation", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(upload())).status).toBe(401);
  mocks.user.mockResolvedValue({ id: owner });
  expect((await POST(upload("not a PDF"))).status).toBe(400);
  expect(rows.size).toBe(0);
  const oversized = new FormData();
  oversized.set("trip_id", trip);
  oversized.set("id", id);
  oversized.set("action", "upload");
  oversized.set(
    "file",
    new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    }),
  );
  expect(
    (
      await POST(
        new Request("http://localhost/api/trip-documents", {
          method: "POST",
          body: oversized,
        }),
      )
    ).status,
  ).toBe(400);
  expect(rows.size).toBe(0);

  expect(
    (
      await POST(
        new Request("http://localhost/api/trip-documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(5 * 1024 * 1024),
          },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(413);
});
it("stores an independent original once, recovers metadata failure and returns no private storage path", async () => {
  failReady = true;
  const failed = await POST(upload());
  expect(failed.status).toBe(409);
  expect(objects.size).toBe(1);
  expect(rows.get(id)?.state).toBe("pending");
  expect(mocks.removed).not.toHaveBeenCalled();
  failReady = false;
  const recovered = await POST(json({ action: "recover" }));
  expect(recovered.status).toBe(200);
  expect(rows.get(id)?.state).toBe("ready");
  expect(rows.size).toBe(1);
  expect(objects.size).toBe(1);
  const retry = await POST(upload());
  expect(retry.status).toBe(200);
  expect(rows.size).toBe(1);
  const body = await retry.json();
  expect(body.file).not.toHaveProperty("path");
  expect(body.file).not.toHaveProperty("content_sha256");
  expect(body.file).not.toHaveProperty("owner_id");
  expect(mocks.removed).not.toHaveBeenCalled();
});
it("never overwrites another source and hides a booking shortcut without deleting bytes", async () => {
  await POST(upload());
  expect((await POST(upload("%PDF-1.4\na different file"))).status).toBe(409);
  rows.set(id, {
    ...rows.get(id),
    document_kind: "booking",
    booking_id: "booking",
  });
  const revision = rows.get(id)!.document_revision;
  expect(
    (
      await POST(
        json({
          action: "metadata",
          label: "A ticket",
          category: "Tickets",
          revision,
          hidden: true,
        }),
      )
    ).status,
  ).toBe(200);
  expect(rows.get(id)?.documents_hidden).toBe(true);
  expect(objects.size).toBe(1);
  expect(
    (
      await POST(
        json({ action: "delete", revision: rows.get(id)!.document_revision }),
      )
    ).status,
  ).toBe(409);
  expect(mocks.removed).not.toHaveBeenCalled();
});
it("deletes only an explicitly requested own independent file and preserves stale revisions", async () => {
  await POST(upload());
  expect((await POST(json({ action: "delete", revision: 0 }))).status).toBe(
    409,
  );
  expect(objects.size).toBe(1);
  expect(
    (
      await POST(
        json({ action: "delete", revision: rows.get(id)!.document_revision }),
      )
    ).status,
  ).toBe(200);
  expect(objects.size).toBe(0);
  expect(rows.size).toBe(0);
});
