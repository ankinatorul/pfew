import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  access: vi.fn(),
  persist: vi.fn(),
  rpc: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  extract: vi.fn(),
  revalidate: vi.fn(),
  remove: vi.fn(),
  fileRecord: vi.fn(),
  capability: vi.fn(),
}));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: mocks.user }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../lib/booking-collection-server", () => ({
  ownedCollection: mocks.access,
  persistCollectionEntry: mocks.persist,
  collectionSetupMessage: "Booking collection needs setup",
}));
vi.mock("../lib/storage-cleanup", () => ({ removeBookingFiles: mocks.remove }));
vi.mock("../lib/automatic-zones", () => ({
  bookingLocationValues: async (_db: unknown, form: FormData) => ({
    ...Object.fromEntries(form),
    timezone: "UTC",
  }),
}));
vi.mock("../lib/booking-extraction", async (original) => ({
  ...(await original<typeof import("../lib/booking-extraction")>()),
  liveBookingExtractor: () => ({ extract: mocks.extract }),
}));
vi.mock("../lib/import-document", () => ({
  importDocument: async () => ({
    mime: "application/pdf",
    base64: "fixture-only",
  }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: async () => ({
    rpc: mocks.rpc,
    storage: {
      from: () => ({ upload: mocks.upload, download: mocks.download }),
    },
    from: () => {
      let operation = "read";
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.fileRecord,
        limit: mocks.capability,
        single: async () =>
          operation === "update"
            ? { data: { id: "file" }, error: null }
            : { data: { path: "fixture/path", state: "ready" }, error: null },
        insert: (value: unknown) => {
          mocks.insert(value);
          return Promise.resolve({ error: null });
        },
        update: (value: unknown) => {
          mocks.update(value);
          operation = "update";
          return query;
        },
      };
      return query;
    },
  }),
}));
import { POST } from "../app/api/booking-collection/route";
import { POST as extract } from "../app/api/booking-import/route";
import {
  emptyCollectionEntry,
  type CollectionEntry,
} from "../lib/booking-collection";
import { extractLabeledText } from "../lib/booking-extraction";
const trip = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  fileId = "33333333-3333-4333-8333-333333333333";
let entry: CollectionEntry;
const bytes = new TextEncoder().encode("%PDF-1.4 isolated fixture");
beforeEach(() => {
  entry = emptyCollectionEntry(id);
  mocks.capability.mockResolvedValue({ data: [], error: null });
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.access.mockImplementation(async () => ({
    trip: {
      id: trip,
      owner_id: "owner",
      creation_state: "draft",
      timezone: "UTC",
    },
    entries: entry.revision ? [entry] : [],
    attachments: [],
    ready: true,
  }));
  mocks.persist.mockImplementation(
    async (_db, _trip, next: CollectionEntry) => {
      entry = { ...next, revision: next.revision + 1 };
      return entry;
    },
  );
  mocks.fileRecord.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.remove.mockResolvedValue(null);
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
});
afterEach(() => vi.clearAllMocks());
const json = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/booking-collection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trip_id: trip,
      id,
      revision: entry.revision,
      ...body,
    }),
  });
function upload() {
  const form = new FormData();
  form.set("action", "upload");
  form.set("trip_id", trip);
  form.set("id", id);
  form.set("revision", String(entry.revision));
  form.set(
    "file",
    new File([bytes], "original.pdf", { type: "application/pdf" }),
  );
  return new Request("http://localhost/api/booking-collection", {
    method: "POST",
    body: form,
  });
}
function extraction() {
  const form = new FormData();
  form.set("trip_id", trip);
  form.set("collection_entry_id", id);
  form.set("revision", String(entry.revision));
  form.set("mode", "ai");
  form.set("text", "");
  form.set("consent", "yes");
  return new Request("http://localhost/api/booking-import", {
    method: "POST",
    body: form,
  });
}
it("requires authentication/owner setup before writes, including on the unmigrated live schema", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(json({ action: "save" }))).status).toBe(401);
  mocks.user.mockResolvedValue({ id: "other" });
  mocks.access.mockRejectedValue(new Error("Trip owner access is required."));
  expect((await POST(json({ action: "save" }))).status).toBe(403);
  mocks.access.mockRejectedValue(new Error("Booking collection needs setup"));
  expect((await POST(json({ action: "save" }))).status).toBe(503);
  expect(mocks.persist).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("saves incomplete manual information separately from reservation status and advances without confirming anything", async () => {
  const response = await POST(
    json({
      action: "save",
      fields: { provider: "Known provider" },
      review_status: "needs_review",
      reservation_status: "unknown",
    }),
  );
  expect(response.status).toBe(200);
  expect(entry.fields).toEqual({ provider: "Known provider" });
  expect(entry.reservation_status).toBe("unknown");
  expect((await POST(json({ action: "advance" }))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("advance_booking_collection", {
    target: trip,
  });
  expect(
    mocks.rpc.mock.calls.some((call) =>
      String(call[0]).includes("create_trip"),
    ),
  ).toBe(false);
});
it("rejects reviewed missing fields while keeping the existing unfinished entry", async () => {
  entry = { ...entry, revision: 1, fields: { provider: "Reliable" } };
  const response = await POST(
    json({
      action: "save",
      fields: entry.fields,
      review_status: "reviewed",
      reservation_status: "unknown",
    }),
  );
  expect(response.status).toBe(400);
  expect(entry.fields.provider).toBe("Reliable");
  expect(mocks.persist).not.toHaveBeenCalled();
});
it("stores and verifies the original before any extraction; a lost upload response is safely recovered", async () => {
  mocks.upload.mockResolvedValue({
    error: { message: "network response lost" },
  });
  const response = await POST(upload());
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result.attachment.state).toBe("ready");
  expect(mocks.persist.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.upload.mock.invocationCallOrder[0],
  );
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      booking_id: null,
      intake_id: id,
      state: "pending",
    }),
  );
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(entry.review_status).toBe("needs_review");
});
it("never claims a failed storage operation succeeded and preserves its stable retry entry", async () => {
  mocks.upload.mockResolvedValue({ error: { message: "offline" } });
  mocks.download.mockResolvedValue({
    data: null,
    error: { message: "not received" },
  });
  const response = await POST(upload());
  const result = await response.json();
  expect(response.status).toBe(400);
  expect(result.error).toContain("not confirmed");
  expect(result.entry.id).toBe(id);
  expect(result.entry.source).toBeTruthy();
  expect(mocks.update).not.toHaveBeenCalled();
});
it("keeps stored source and reliable fields when extraction fails, then retries from storage without reupload", async () => {
  entry = {
    ...entry,
    revision: 1,
    fields: { provider: "Reliable correction" },
    source: {
      attachment_id: fileId,
      filename: "source.pdf",
      content_type: "application/pdf",
      size: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    },
  };
  mocks.extract.mockRejectedValueOnce(new Error("provider unavailable"));
  const failed = await extract(extraction());
  expect(failed.status).toBe(503);
  expect(entry.source?.attachment_id).toBe(fileId);
  expect(entry.fields.provider).toBe("Reliable correction");
  expect(entry.extraction.status).toBe("failed");
  mocks.extract.mockResolvedValueOnce({
    ...extractLabeledText(
      "Provider: Different provider\nStart date: 2027-05-01",
    ),
    method: "ai",
  });
  const recovered = await extract(extraction());
  expect(recovered.status).toBe(200);
  expect(entry.fields.provider).toBe("Reliable correction");
  expect(entry.fields.start_date).toBe("2027-05-01");
  expect(entry.reservation_status).toBe("unknown");
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("retains fields and clear feedback when requested removal cannot remove a private file", async () => {
  entry = {
    ...entry,
    revision: 1,
    fields: { title: "Keep until deletion succeeds" },
  };
  mocks.remove.mockResolvedValue(
    "Could not finish removing attached files. Retry deletion to continue.",
  );
  const response = await POST(json({ action: "remove" }));
  expect(response.status).toBe(400);
  expect(entry.removing).toBe(true);
  expect(entry.fields.title).toBe("Keep until deletion succeeds");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("recovers the same stored source after a lost response without requiring a current client revision", async () => {
  const original = upload(),
    retry = upload();
  const saved = await POST(original);
  expect(saved.status).toBe(200);
  const source = entry.source!;
  mocks.fileRecord.mockResolvedValue({
    data: {
      id: source.attachment_id,
      state: "ready",
      content_sha256: source.checksum,
      path: ["owner", trip, id, source.attachment_id].join("/"),
    },
    error: null,
  });
  const repeated = await POST(retry);
  expect(repeated.status).toBe(200);
  const result = await repeated.json();
  expect(result.entry.id).toBe(id);
  expect(result.attachment.id).toBe(source.attachment_id);
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(mocks.persist).toHaveBeenCalledOnce();
});
it("passes a stale save revision to the atomic RPC instead of defeating retry/conflict handling", async () => {
  entry = { ...entry, revision: 2, fields: { provider: "Saved" } };
  const response = await POST(
    json({
      action: "save",
      revision: 1,
      fields: entry.fields,
      review_status: "needs_review",
      reservation_status: "unknown",
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.persist).toHaveBeenCalledWith(
    expect.anything(),
    trip,
    expect.objectContaining({ revision: 1 }),
  );
});

it("validates and gates payment deadlines without losing or saving unsupported fields", async () => {
  const body = {
    action: "save",
    revision: 0,
    fields: {
      title: "Later payment",
      payment_status: "unpaid",
      payment_due_date: "2027-05-01",
    },
    review_status: "needs_review",
    reservation_status: "unknown",
  };
  mocks.capability.mockResolvedValueOnce({ error: { code: "42703" } });
  expect((await POST(json(body))).status).toBe(409);
  expect(mocks.persist).not.toHaveBeenCalled();
  expect(
    (
      await POST(
        json({
          ...body,
          fields: { ...body.fields, payment_due_date: "not a date" },
        }),
      )
    ).status,
  ).toBe(400);
  expect((await POST(json(body))).status).toBe(200);
  expect(mocks.persist).toHaveBeenCalledWith(
    expect.anything(),
    trip,
    expect.objectContaining({
      fields: body.fields,
      review_status: "needs_review",
      reservation_status: "unknown",
    }),
  );
});

it("preserves unedited legacy zones and geographic context during a compact reviewed edit", async () => {
  entry = {
    ...entry,
    revision: 1,
    fields: {
      ...entry.fields,
      title: "Old name",
      category: "flight",
      currency: "EUR",
      start_date: "2027-05-01",
      end_date: "2027-05-01",
      timezone: "Pacific/Honolulu",
      end_timezone: "Pacific/Honolulu",
      travelers: "Keep traveler",
      notes: "Keep notes",
      payment_status: "partial",
      paid_amount: 10,
      location_id: null,
      location_label: "Original receipt location",
      latitude: 21.3,
      longitude: -157.8,
      segment_id: null,
    },
  };
  const response = await POST(
    json({
      action: "save",
      revision: 1,
      fields: { ...entry.fields, title: "Corrected name" },
      review_status: "reviewed",
      reservation_status: "pending",
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.persist).toHaveBeenCalledWith(
    expect.anything(),
    trip,
    expect.objectContaining({
      reservation_status: "pending",
      fields: expect.objectContaining({
        title: "Corrected name",
        timezone: "Pacific/Honolulu",
        end_timezone: "Pacific/Honolulu",
        location_label: "Original receipt location",
        latitude: 21.3,
        longitude: -157.8,
        travelers: "Keep traveler",
        notes: "Keep notes",
        paid_amount: 10,
        payment_status: "partial",
      }),
    }),
  );
});
