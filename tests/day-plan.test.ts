import { it, expect } from "vitest";
import { dayPlanValues } from "../lib/day-plan";
import { searchLocations } from "../lib/locations";
import type { Segment } from "../lib/domain";
const base = {
  id: "a",
  trip_id: "trip",
  kind: "activity",
  title: "A plan",
  start_date: "2027-05-01",
  end_date: "2027-05-01",
  local_time: "10:00",
  timezone: "Asia/Tokyo",
  status: "confirmed",
  notes: "",
  address: "",
  provider: "",
  reference: "",
  origin: "",
  arrival_location: "",
  arrival_time: "",
  arrival_timezone: "",
  transport_mode: "",
  position: 0,
  destination_id: "tokyo",
  duration_minutes: 60,
} satisfies Segment;
const trip = {
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "Asia/Tokyo",
};
const destinations = [
  {
    ...base,
    id: "tokyo",
    kind: "destination",
    status: "planned",
    start_date: "2027-05-01",
    end_date: "2027-05-04",
    timezone: "Asia/Tokyo",
  },
  {
    ...base,
    id: "sydney",
    kind: "destination",
    status: "planned",
    start_date: "2027-05-05",
    end_date: "2027-05-10",
    timezone: "Australia/Sydney",
  },
];
it("moves a plan into the correct destination zone, preserving its local time and requiring reconfirmation", () => {
  const values = dayPlanValues(base, trip, destinations, {
    day: "2027-05-06",
    local_time: "10:00",
    duration_minutes: 90,
  });
  expect(values).toMatchObject({
    start_date: "2027-05-06",
    end_date: "2027-05-06",
    timezone: "Australia/Sydney",
    destination_id: "sydney",
    status: "planned",
    local_time: "10:00",
    duration_minutes: 90,
  });
});
it("keeps an explicitly resolved city and existing confirmation for duration-only corrections", () => {
  const item = { ...base, location_id: searchLocations("Tokyo")[0].id };
  expect(
    dayPlanValues(item, trip, destinations, {
      day: "2027-05-06",
      local_time: "10:00",
      duration_minutes: 60,
    }).timezone,
  ).toBe("Asia/Tokyo");
  expect(
    dayPlanValues(base, trip, destinations, {
      day: "2027-05-01",
      local_time: "10:00",
      duration_minutes: 90,
    }).status,
  ).toBe("confirmed");
});
it("rejects out-of-trip dates and leaves complex multi-day records to the detailed form", () => {
  for (const item of [
    { ...base, kind: "stay" },
    { ...base, kind: "transport" },
    { ...base, end_date: "2027-05-02" },
    { ...base, status: "idea" },
  ])
    expect(() =>
      dayPlanValues(item, trip, destinations, {
        day: "2027-05-06",
        local_time: "",
        duration_minutes: null,
      }),
    ).toThrow("detailed");
  expect(() =>
    dayPlanValues(base, trip, destinations, {
      day: "2027-05-11",
      local_time: "",
      duration_minutes: null,
    }),
  ).toThrow("within");
});
