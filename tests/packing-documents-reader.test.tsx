import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
import { PackingDocuments } from "../components/packing-documents";
import { overviewTrip } from "./fixtures/trip-overview";
let missing = false,
  broken = false;
let projections: string[] = [];
beforeEach(() => {
  missing = false;
  broken = false;
  projections = [];
  mocks.access.mockResolvedValue({
    user: { id: "owner" },
    db: {
      from: (table: string) => {
        let fields = "*";
        const result = () => ({
          data: [],
          error:
            missing &&
            (fields.includes("revision") ||
              fields.includes("document_kind") ||
              fields.includes("intake_id"))
              ? { code: "42703" }
              : broken && table === "packing_items"
                ? { code: "failed" }
                : null,
        });
        const q = {
          select: (v: string) => {
            fields = v;
            projections.push(v);
            return q;
          },
          eq: () => q,
          in: () => q,
          order: () => q,
          limit: () => q,
          then: (resolve: (r: unknown) => unknown) =>
            Promise.resolve(result()).then(resolve),
        };
        return q;
      },
    },
  });
});
it("reads legacy private confirmations when 016 and intake metadata columns are absent", async () => {
  missing = true;
  const page = await PackingDocuments({
    trip: overviewTrip,
    segments: [],
    view: "documents",
    canEdit: true,
  });
  expect(page.props.ready).toBe(false);
  expect(page.props.loadError).toBeUndefined();
  expect(projections).toContain(
    "id,trip_id,booking_id,filename,content_type,size,created_at,state",
  );
});
it("keeps old packing rows visible with new controls disabled, but blocks misleading progress after a read failure", async () => {
  missing = true;
  let page = await PackingDocuments({
    trip: overviewTrip,
    segments: [],
    view: "packing",
    canEdit: true,
  });
  expect(page.props.ready).toBe(false);
  expect(page.props.loadError).toBeUndefined();
  missing = false;
  broken = true;
  page = await PackingDocuments({
    trip: overviewTrip,
    segments: [],
    view: "packing",
    canEdit: false,
  });
  expect(page.props.loadError).toContain("could not be loaded");
});
