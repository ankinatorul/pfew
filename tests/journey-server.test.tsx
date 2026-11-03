import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  deleteSegment: vi.fn(),
  check: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../app/actions", () => ({ deleteSegment: mocks.deleteSegment }));
vi.mock("../app/intelligence-actions", () => ({ runTripCheck: mocks.check }));
import { JourneyOverview } from "../components/pfew/journey-overview";
import { journeyTrip, journeySegments } from "./journey-fixtures";
import { journeyBookingColumns } from "../lib/journey";
afterEach(() => vi.resetAllMocks());
function database(fail = false) {
  const reads: {
    table: string;
    columns: string;
    key: string;
    value: unknown;
  }[] = [];
  const rows: Record<string, unknown> = {
    bookings: [],
    trip_check_findings: [
      { id: "open", title: "A saved observation", active: true },
      { id: "handled", title: "A dismissed observation", active: true },
    ],
    finding_decisions: [
      { finding_id: "handled", decision: "dismissed", remind_after: null },
    ],
    trip_check_runs: { checked_at: "2026-11-03T12:00:00.000Z" },
  };
  mocks.access.mockResolvedValue({
    db: {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: (key: string, value: unknown) => {
            reads.push({ table, columns, key, value });
            const response = {
              data: rows[table],
              error: fail ? { code: "42501" } : null,
            };
            const promise = Promise.resolve(response);
            return {
              then: promise.then.bind(promise),
              maybeSingle: () => promise,
            };
          },
        }),
      }),
    },
  });
  return reads;
}
it("uses ordinary trip-scoped reads, respects handled findings and exposes no editing controls for Viewers", async () => {
  const reads = database();
  const markup = renderToStaticMarkup(
    await JourneyOverview({
      trip: journeyTrip,
      segments: journeySegments,
      canEdit: false,
    }),
  );
  expect(reads).toHaveLength(4);
  expect(
    reads.every((r) => r.key === "trip_id" && r.value === journeyTrip.id),
  ).toBe(true);
  expect(reads.find((r) => r.table === "bookings")?.columns).toBe(
    journeyBookingColumns,
  );
  expect(markup).toContain("1 saved finding to review.");
  expect(markup).toContain("A saved observation");
  expect(markup).not.toContain("A dismissed observation");
  expect(markup).not.toContain("Options for Tokyo");
  expect(markup).not.toContain("Delete destination");
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.deleteSegment).not.toHaveBeenCalled();
});
it("reports a read failure instead of displaying invented zero summaries or successful checks", async () => {
  database(true);
  await expect(
    JourneyOverview({
      trip: journeyTrip,
      segments: journeySegments,
      canEdit: true,
    }),
  ).rejects.toThrow("Your journey details could not be loaded");
});
