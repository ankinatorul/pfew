import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runSetupChecks,
  schemaProbes,
  type SetupConfiguration,
} from "../lib/setup-checks";

const userId = "11111111-1111-4111-8111-111111111111";
const path = [
  userId,
  ...[2, 3, 4].map((n) => `${n}1111111-1111-4111-8111-111111111111`),
].join("/");
const configuration: SetupConfiguration = {
  siteUrl: "https://pfew.vercel.app/private?token=omit-me",
  projectUrl: "https://project.example.test",
  ai: true,
  places: false,
  maps: true,
  commit: "a".repeat(40),
};
function fixture(
  options: {
    errors?: Record<string, unknown>;
    path?: string | null;
    signedUrl?: string;
    signedError?: boolean;
  } = {},
) {
  const queries: {
    table: string;
    columns?: string;
    limit?: number;
    filters: Record<string, unknown>;
  }[] = [];
  const db = {
    from(table: string) {
      const query = { table, filters: {} } as (typeof queries)[number];
      queries.push(query);
      const result = { data: [], error: options.errors?.[table] || null };
      const builder = {
        select(columns: string) {
          query.columns = columns;
          return builder;
        },
        limit(n: number) {
          query.limit = n;
          return builder;
        },
        eq(key: string, value: unknown) {
          query.filters[key] = value;
          return builder;
        },
        abortSignal() {
          return builder;
        },
        maybeSingle: async () => ({
          data: options.path ? { path: options.path } : null,
          error: null,
        }),
        then: Promise.resolve(result).then.bind(Promise.resolve(result)),
      };
      return builder;
    },
    rpc: vi.fn(() => ({
      abortSignal: async () => ({
        data: {
          monthly_limit_cents: 500,
          estimated_cents: 0,
          daily_user_requests: 30,
        },
        error: null,
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({
          data: options.signedError
            ? null
            : {
                signedUrl:
                  options.signedUrl ||
                  `https://project.example.test/storage/v1/object/sign/booking-files/${path}?token=omit-signed-token`,
              },
          error: options.signedError ? { message: "private raw error" } : null,
        })),
      })),
    },
  };
  const inspectGoogle = vi.fn(async () => ({ google: "enabled" as const }));
  const fetcher = vi.fn<typeof fetch>();
  const run = (includeDocument = false) =>
    runSetupChecks({
      db: db as unknown as SupabaseClient,
      userId,
      configuration,
      inspectGoogle,
      fetcher,
      includeDocument,
    });
  return { db, queries, run, fetcher, inspectGoogle };
}
it("only performs zero-row schema reads and read-only limit reporting by default", async () => {
  const f = fixture();
  const report = await f.run();
  expect(report.database).toEqual({
    passed: schemaProbes.length,
    total: schemaProbes.length,
  });
  expect(f.queries).toHaveLength(schemaProbes.length);
  expect(f.queries.every((q) => q.limit === 0)).toBe(true);
  expect(f.queries.some((q) => q.table === "service_budget_settings")).toBe(
    false,
  );
  expect(f.db.rpc.mock.calls).toEqual([["service_budget_status"]]);
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.db.storage.from).not.toHaveBeenCalled();
  const state = (id: string) => report.checks.find((c) => c.id === id)?.state;
  expect(state("ai")).toBe("configured");
  expect(state("maps")).toBe("configured");
  expect(state("places")).toBe("optional");
  for (const id of ["saving", "sharing", "storage-policies", "document-read"])
    expect(state(id)).toBe("not_tested");
  expect(report.siteOrigin).toBe("https://pfew.vercel.app");
  expect(JSON.stringify(report)).not.toContain("omit-me");
  expect(JSON.stringify(report)).not.toContain(userId);
});
it("reports missing fields separately from denied or failed reads without exposing raw errors", async () => {
  const f = fixture({
    errors: {
      bookings: { code: "42703", message: "private booking name and token" },
      trips: { code: "42501", message: "private owner email" },
      profiles: { code: "sensitive-unknown-value", message: "secret" },
    },
  });
  f.inspectGoogle.mockRejectedValue(new Error("private upstream error"));
  const report = await f.run();
  expect(report.database.passed).toBe(schemaProbes.length - 3);
  expect(report.checks.find((c) => c.id === "schema-bookings")).toMatchObject({
    state: "needs_setup",
    code: "42703",
  });
  expect(report.checks.find((c) => c.id === "schema-trips")).toMatchObject({
    state: "unknown",
    code: "42501",
  });
  expect(report.checks.find((c) => c.id === "schema-profiles")).toMatchObject({
    state: "unknown",
    code: "REQUEST_FAILED",
  });
  expect(report.checks.find((c) => c.id === "google-provider")?.state).toBe(
    "unknown",
  );
  for (const secret of [
    "private upstream",
    "private booking",
    "private owner",
    "sensitive-unknown",
    '"secret"',
  ])
    expect(JSON.stringify(report)).not.toContain(secret);
});
it("probes only a completed document owned by this account and omits all document identifiers", async () => {
  const f = fixture({ path });
  f.fetcher
    .mockResolvedValueOnce(new Response("x", { status: 206 }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  const report = await f.run(true);
  expect(f.queries.find((q) => q.limit === 1)).toMatchObject({
    table: "booking_attachments",
    columns: "path",
    filters: { owner_id: userId, state: "ready" },
  });
  expect(report.checks.find((c) => c.id === "document-read")?.state).toBe(
    "passed",
  );
  expect(report.checks.find((c) => c.id === "document-public")?.state).toBe(
    "passed",
  );
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const [publicUrl, init] = f.fetcher.mock.calls[1];
  expect(String(publicUrl)).not.toContain("token=");
  expect(init).toMatchObject({
    headers: { Range: "bytes=0-0" },
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });
  for (const value of [path, userId, "omit-signed-token", "booking-files/"])
    expect(JSON.stringify(report)).not.toContain(value);
});
it.each([403, 404])(
  "does not claim a privacy pass from unsigned denial when signed read returned %s",
  async (status) => {
    const f = fixture({ path });
    f.fetcher
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const report = await f.run(true);
    expect(report.checks.find((c) => c.id === "document-public")?.state).toBe(
      "unknown",
    );
  },
);
it("detects a document served publicly even when signed URL creation fails", async () => {
  const f = fixture({ path, signedError: true });
  f.fetcher.mockResolvedValue(new Response("x", { status: 200 }));
  const report = await f.run(true);
  expect(report.checks.find((c) => c.id === "document-public")?.state).toBe(
    "needs_setup",
  );
});
it("rejects unexpected signed URL origins and malformed paths", async () => {
  const f = fixture({
    path,
    signedUrl: "https://untrusted.example.test/steal",
  });
  f.fetcher.mockResolvedValue(new Response(null, { status: 403 }));
  const report = await f.run(true);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(String(f.fetcher.mock.calls[0][0])).toContain(
    "https://project.example.test/",
  );
  expect(report.checks.find((c) => c.id === "document-public")?.state).toBe(
    "unknown",
  );
  const malformed = fixture({ path: `${userId}/../../private` });
  expect(
    (await malformed.run(true)).checks.find((c) => c.id === "document-read")
      ?.state,
  ).toBe("unknown");
  expect(malformed.fetcher).not.toHaveBeenCalled();
  expect(malformed.db.storage.from).not.toHaveBeenCalled();
});
it("leaves document reads untested when the account has no completed upload", async () => {
  const f = fixture();
  expect(
    (await f.run(true)).checks.find((c) => c.id === "document-read")?.state,
  ).toBe("not_tested");
  expect(f.fetcher).not.toHaveBeenCalled();
});
it("still checks anonymous access after a signed request fails", async () => {
  const f = fixture({ path });
  f.fetcher
    .mockRejectedValueOnce(new Error("private request error"))
    .mockResolvedValueOnce(new Response("x", { status: 200 }));
  const report = await f.run(true);
  expect(report.checks.find((c) => c.id === "document-read")?.state).toBe(
    "unknown",
  );
  expect(report.checks.find((c) => c.id === "document-public")?.state).toBe(
    "needs_setup",
  );
  expect(JSON.stringify(report)).not.toContain("private request error");
});
it("bounds signed URL creation by the shared deadline", async () => {
  const f = fixture({ path });
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
  f.db.storage.from.mockReturnValue({
    createSignedUrl: vi.fn(() => new Promise(() => {})),
  });
  try {
    const report = await f.run(true);
    expect(report.checks.find((c) => c.id === "document-read")?.state).toBe(
      "unknown",
    );
  } finally {
    vi.restoreAllMocks();
  }
});
