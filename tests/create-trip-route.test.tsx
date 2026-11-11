import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  single: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  useRouter: () => ({}),
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
}));
vi.mock("../lib/booking-collection-server", () => ({
  loadBookingCollection: async () => ({
    entries: [],
    attachments: [],
    ready: true,
    error: "",
  }),
}));
import New from "../app/trips/new/page";
import { TripReviewClient } from "../components/trip-review-client";
import { CreateTrip } from "../components/create-trip";
import { geographicLocation } from "../lib/geographic-location";
const id = "11111111-1111-4111-8111-111111111111";
const draft = {
  id,
  name: "Private possibility",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  draft_data: { destinations: [geographicLocation("Kyoto", "Japan", 35, 135)] },
  draft_step: 2,
  draft_revision: 1,
  updated_at: "2026-11-06T12:00:00Z",
};
beforeEach(() => {
  const query = {
    select: () => query,
    eq: mocks.eq,
    order: mocks.order,
    limit: async () => ({ error: null }),
    maybeSingle: mocks.single,
  };
  mocks.single.mockResolvedValue({ data: null, error: null });
  mocks.eq.mockReturnValue(query);
  mocks.order.mockResolvedValue({ data: [draft], error: null });
  mocks.access.mockResolvedValue({
    db: { from: () => query },
    user: { id: "owner" },
  });
});
afterEach(() => vi.clearAllMocks());
const route = (query: Record<string, string> = {}) =>
  New({ searchParams: Promise.resolve(query) });
function find(
  node: ReactNode,
  type: unknown,
): ReturnType<typeof New> extends Promise<infer T> ? T | null : never {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === type) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}
it("loads only the signed-in owner's drafts and offers resume/start new without selecting a trip", async () => {
  const page = await route();
  expect(mocks.eq).toHaveBeenCalledWith("creation_state", "draft");
  expect(mocks.eq).toHaveBeenCalledWith("owner_id", "owner");
  expect(find(page, CreateTrip)?.props).toMatchObject({
    drafts: [draft],
    ready: true,
    explicit: false,
  });
});
it("restores saved progress, allows basics editing, and rejects inaccessible draft IDs", async () => {
  const page = await route({ draft: id });
  expect(find(page, CreateTrip)).toBeNull();
  expect(
    find(await route({ draft: id, step: "1" }), CreateTrip)?.props,
  ).toMatchObject({ id, draft, explicit: true });
  await expect(
    route({ draft: "22222222-2222-4222-8222-222222222222" }),
  ).rejects.toThrow("not-found");
});
it("keeps new drafts independent and redirects the retired four-step creation route", async () => {
  const next = "22222222-2222-4222-8222-222222222222";
  expect(find(await route({ new: next }), CreateTrip)?.props).toMatchObject({
    id: next,
    explicit: true,
  });
  await expect(route({ legacy: "1" })).rejects.toThrow("redirect:/trips/new");
});
it("honestly gates saving on missing migration and does not broaden reads on connection errors", async () => {
  mocks.order.mockResolvedValue({
    data: null,
    error: { code: "42703", message: "column creation_state does not exist" },
  });
  expect(find(await route(), CreateTrip)?.props).toMatchObject({
    ready: false,
    drafts: [],
  });
  mocks.order.mockResolvedValue({
    data: null,
    error: { code: "500", message: "connection failed" },
  });
  expect(find(await route(), CreateTrip)).toBeNull();
});

it("returns legacy incomplete drafts to basics without discarding them or trusting progress", async () => {
  for (const dates of [
    { start_date: null },
    { end_date: null },
    { start_date: "2027-06-01", end_date: "2027-05-01" },
  ]) {
    const incomplete = { ...draft, ...dates };
    mocks.order.mockResolvedValue({ data: [incomplete], error: null });
    expect(find(await route({ draft: id }), CreateTrip)?.props).toMatchObject({
      draft: incomplete,
      id,
    });
  }
});

it("renders the real final review with saved basics and restores server-confirmed success on refresh", async () => {
  const review = await route({ draft: id, step: "3" });
  expect(find(review, TripReviewClient)?.props).toMatchObject({
    revision: 1,
    ready: true,
    basics: { name: draft.name, destinations: draft.draft_data.destinations },
  });
  mocks.order.mockResolvedValue({ data: [], error: null });
  mocks.single.mockResolvedValue({
    data: {
      ...draft,
      creation_state: "finalized",
      draft_data: {
        ...draft.draft_data,
        finalization_receipt: { reviewed: 0, unfinished: 0 },
      },
    },
    error: null,
  });
  expect(
    find(await route({ draft: id }), TripReviewClient)?.props,
  ).toMatchObject({ finalized: true, userId: "owner" });
});
