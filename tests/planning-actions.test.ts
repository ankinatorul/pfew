import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), revalidate: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { planIdea } from "../app/intelligence-actions";
import { quickAdd, updateDayPlan } from "../app/planning-actions";
const tripId = "11111111-1111-4111-8111-111111111111",
  destinationId = "22222222-2222-4222-8222-222222222222",
  itemId = "33333333-3333-4333-8333-333333333333";
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>,
  writeError: string | null,
  beforeUpdate: (() => void) | null;
function db() {
  return {
    from: (table: string) => {
      let rows = [...(tables[table] || [])],
        operation = "read",
        payload: Row = {};
      const finish = () => {
        if (operation === "insert") {
          if (writeError) return { data: null, error: { code: writeError } };
          if (tables[table].some((row) => row.id === payload.id))
            return { data: null, error: { code: "23505" } };
          tables[table].push({ ...payload });
          return { data: null, error: null };
        }
        if (operation === "update") {
          if (writeError) return { data: null, error: { code: writeError } };
          rows.forEach((row) => Object.assign(row, payload));
        }
        return { data: rows, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          rows = rows.filter((row) => row[key] === value);
          return query;
        },
        neq: (key: string, value: unknown) => {
          rows = rows.filter((row) => row[key] !== value);
          return query;
        },
        order: () => query,
        insert: (value: Row) => {
          operation = "insert";
          payload = value;
          return query;
        },
        update: (value: Row) => {
          beforeUpdate?.();
          operation = "update";
          payload = value;
          return query;
        },
        single: async () => {
          const result = finish();
          return result.error
            ? result
            : {
                data: result.data?.[0] || null,
                error: result.data?.length ? null : { code: "PGRST116" },
              };
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(finish()).then(resolve),
      };
      return query;
    },
  };
}
const form = (values: Record<string, string>) => {
  const value = new FormData();
  Object.entries(values).forEach(([key, item]) => value.set(key, item));
  return value;
};
beforeEach(() => {
  vi.clearAllMocks();
  writeError = null;
  beforeUpdate = null;
  tables = {
    trips: [
      {
        id: tripId,
        start_date: "2027-05-01",
        end_date: "2027-05-10",
        timezone: "UTC",
      },
    ],
    trip_segments: [
      {
        id: destinationId,
        trip_id: tripId,
        kind: "destination",
        status: "planned",
        title: "Tokyo",
        start_date: "2027-05-01",
        end_date: "2027-05-10",
        timezone: "Asia/Tokyo",
        position: 0,
      },
    ],
    bookings: [],
  };
  mocks.access.mockResolvedValue({ db: db(), user: { id: "owner" } });
});
const quickForm = () =>
  form({
    trip_id: tripId,
    id: itemId,
    kind: "activity",
    title: "My dinner option",
    mode: "day",
    day: "2027-05-03",
    destination_id: destinationId,
    local_time: "19:00",
    duration_minutes: "60",
    address: "My own address",
    notes: "Ask everyone first",
    maps_link:
      "https://www.google.com/maps/search/?api=1&query=My+option&query_place_id=ChIJ12345&utm_source=tracking",
    google_place_id: "",
    timezone: "America/New_York",
  });
it("saves an approved quick item with server-derived time and only personal label/place ID/link", async () => {
  const result = await quickAdd({}, quickForm());
  expect(result.savedId).toBe(itemId);
  const saved = tables.trip_segments.find((row) => row.id === itemId);
  expect(saved).toMatchObject({
    title: "My dinner option",
    status: "planned",
    timezone: "Asia/Tokyo",
    google_place_id: "ChIJ12345",
    start_date: "2027-05-03",
    duration_minutes: 60,
    address: "My own address",
  });
  expect(saved?.notes).toContain(
    "Google Maps link: https://www.google.com/maps/search/",
  );
  expect(saved?.notes).not.toContain("tracking");
  expect(saved?.latitude).toBeNull();
  expect(tables.bookings).toHaveLength(0);
  await quickAdd({}, quickForm());
  expect(tables.trip_segments.filter((row) => row.id === itemId)).toHaveLength(
    1,
  );
});
it("preserves ideas as unscheduled and rejects mismatched days and unsupported links", async () => {
  const input = quickForm();
  input.set("mode", "idea");
  input.set("day", "");
  expect((await quickAdd({}, input)).savedId).toBe(itemId);
  expect(tables.trip_segments.find((row) => row.id === itemId)).toMatchObject({
    status: "idea",
    local_time: "",
  });
  const bad = quickForm();
  bad.set("day", "2027-05-11");
  expect((await quickAdd({}, bad)).error).toContain("within");
  bad.set("day", "2027-05-03");
  bad.set("maps_link", "https://evil.example/maps");
  expect((await quickAdd({}, bad)).error).toContain("supported");
  writeError = "42501";
  const denied = quickForm();
  denied.set("id", crypto.randomUUID());
  expect((await quickAdd({}, denied)).savedId).toBeUndefined();
});
function plan() {
  const row = {
    id: itemId,
    trip_id: tripId,
    kind: "activity",
    status: "confirmed",
    title: "Existing plan",
    start_date: "2027-05-02",
    end_date: "2027-05-02",
    local_time: "10:00",
    timezone: "Asia/Tokyo",
    location_id: null,
    destination_id: destinationId,
    updated_at: "2027-01-01T10:00:00.000Z",
    position: 0,
  };
  tables.trip_segments.push(row);
  tables.bookings.push({
    id: "wallet",
    segment_id: itemId,
    start_date: "2027-05-02",
  });
  return row;
}
const planForm = () =>
  form({
    trip_id: tripId,
    id: itemId,
    expected_updated_at: "2027-01-01T10:00:00.000Z",
    day: "2027-05-03",
    local_time: "10:30",
    duration_minutes: "90",
  });
it("updates one plan and keeps the original wallet record intact", async () => {
  const row = plan();
  await expect(updateDayPlan({}, planForm())).rejects.toThrow(
    "redirect:/trips/" + tripId + "?view=itinerary&day=2027-05-03",
  );
  expect(row).toMatchObject({
    start_date: "2027-05-03",
    end_date: "2027-05-03",
    local_time: "10:30",
    duration_minutes: 90,
    status: "planned",
  });
  expect(tables.bookings[0].start_date).toBe("2027-05-02");
});
it("rejects stale and racing writes without overwriting another edit", async () => {
  const row = plan();
  row.updated_at = "2027-01-01T11:00:00.000Z";
  expect((await updateDayPlan({}, planForm())).error).toContain(
    "Someone changed",
  );
  expect(row.start_date).toBe("2027-05-02");
  row.updated_at = "2027-01-01T10:00:00.000Z";
  beforeUpdate = () => {
    row.updated_at = "2027-01-01T12:00:00.000Z";
  };
  expect((await updateDayPlan({}, planForm())).error).toContain("changed");
  expect(row.start_date).toBe("2027-05-02");
});

it("schedules an idea under the destination for its chosen day rather than a stale parent", async () => {
  const item = plan();
  item.status = "idea";
  tables.trip_segments[0].end_date = "2027-05-04";
  const sydney = "44444444-4444-4444-8444-444444444444";
  tables.trip_segments.push({
    ...tables.trip_segments[0],
    id: sydney,
    start_date: "2027-05-05",
    end_date: "2027-05-10",
    timezone: "Australia/Sydney",
  });
  await expect(
    planIdea(
      form({
        trip_id: tripId,
        id: itemId,
        day: "2027-05-06",
        local_time: "10:00",
        duration_minutes: "60",
      }),
    ),
  ).rejects.toThrow(
    "redirect:/trips/" + tripId + "?view=itinerary&day=2027-05-06",
  );
  expect(item).toMatchObject({
    status: "planned",
    destination_id: sydney,
    timezone: "Australia/Sydney",
  });
});
