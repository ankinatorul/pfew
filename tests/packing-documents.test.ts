import { it, expect } from "vitest";
import {
  packingProgress,
  packingGroups,
  packingInput,
  newPackingDuplicate,
  relevantReminders,
  fileLabel,
} from "../lib/packing-documents";
import { packingStarter, withoutExisting } from "../lib/readiness";
import { tripOverview } from "../lib/trip-overview";
import {
  overviewData,
  overviewTrip,
  overviewTask,
} from "./fixtures/trip-overview";
const list = "44444444-4444-4444-8444-444444444444",
  item = {
    id: "55555555-5555-4555-8555-555555555555",
    trip_id: overviewTrip.id,
    list_id: list,
    title: "Cable",
    category: "Electronics",
    quantity: 2,
    packed: false,
  };
it("computes real progress by checked item rows, including an honest empty state", () => {
  expect(packingProgress([])).toEqual({
    total: 0,
    packed: 0,
    remaining: 0,
    percent: 0,
  });
  expect(
    packingProgress([
      item,
      { ...item, id: crypto.randomUUID(), packed: true, quantity: 5 },
    ]),
  ).toEqual({ total: 2, packed: 1, remaining: 1, percent: 50 });
});
it("validates simple item defaults, quantities, notes and stable IDs", () => {
  const input = { ...item, revision: 0, category: "", notes: "" };
  expect(packingInput.parse(input).category).toBe("Other");
  for (const patch of [
    { title: "" },
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 1001 },
    { notes: "a".repeat(1001) },
  ])
    expect(packingInput.safeParse({ ...input, ...patch }).success).toBe(false);
  expect(newPackingDuplicate(" CABLE ", [item])?.id).toBe(item.id);
});
it("groups real categories and positions without treating an empty list as complete", () => {
  const groups = packingGroups([
    { ...item, title: "Second", position: 2 },
    { ...item, id: crypto.randomUUID(), title: "First", position: 1 },
  ]);
  expect(groups[0].items.map((i) => i.title)).toEqual(["First", "Second"]);
});
it("offers optional theme starters with no weather claim and filters duplicates before review", () => {
  const values = packingStarter(
    {
      days: 5,
      destinations: ["Bali"],
      theme: "Tropical",
      transportModes: [],
      hasBookings: false,
    },
    3,
  );
  expect(values.some((i) => i.title === "Sun protection you use")).toBe(true);
  expect(
    values.find((i) => i.title === "Sun protection you use")?.reason,
  ).toContain("not verified");
  expect(
    withoutExisting(values, [{ title: " CHARGING CABLE " }]).some(
      (i) => i.title === "Charging cable",
    ),
  ).toBe(false);
});
it("uses existing preparation tasks without treating an upload or packed checkbox as task completion", () => {
  const tasks = [
    overviewTask({ title: "Finish packing", done: false }),
    overviewTask({
      id: crypto.randomUUID(),
      title: "Check passport expiration",
      category: "Documents",
      done: false,
    }),
  ];
  expect(relevantReminders(tasks, "packing")).toHaveLength(1);
  expect(relevantReminders(tasks, "documents")).toHaveLength(1);
  expect(tasks.every((t) => !t.done)).toBe(true);
  expect(
    fileLabel({
      id: "id",
      trip_id: "trip",
      booking_id: null,
      filename: "original.pdf",
      display_name: "My file",
      content_type: "application/pdf",
      size: 1,
      created_at: "2027-05-01",
      state: "ready",
    }),
  ).toBe("My file");
});

it("keeps dashboard packing/file counts aligned without completing document tasks", () => {
  const task = overviewTask({
    title: "Check travel documents",
    category: "Documents",
    done: false,
  });
  const model = tripOverview(
    overviewTrip,
    [],
    overviewData({
      packingLists: [{ id: list }],
      packingItems: [item, { ...item, id: crypto.randomUUID(), packed: true }],
      documents: [{ state: "ready" }, { state: "pending" }],
      tasks: [task],
    }),
    new Date("2027-04-25T12:00:00Z"),
  );
  expect(model.packing).toEqual({ total: 2, packed: 1, lists: 1 });
  expect(model.documents).toEqual({ ready: 1, pending: 1 });
  expect(task.done).toBe(false);
});
