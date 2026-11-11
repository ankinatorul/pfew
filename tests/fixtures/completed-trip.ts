import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
  overviewTask,
  overviewData,
} from "./trip-overview";

export const completedNow = new Date("2027-05-20T12:00:00Z");
export const completedTrip = {
  ...overviewTrip,
  name: "My saved spring journey",
};
export const completedSegments = [
  overviewSegment({ title: "First saved stop", end_date: "2027-05-05" }),
  overviewSegment({
    id: "55555555-5555-4555-8555-555555555555",
    title: "Second saved stop",
    start_date: "2027-05-06",
  }),
  overviewSegment({
    id: "66666666-6666-4666-8666-666666666666",
    kind: "activity",
    title: "A saved activity",
    start_date: "2027-05-03",
    end_date: "2027-05-03",
    status: "planned",
    local_time: "10:00",
  }),
];
export const completedData = () =>
  overviewData({
    bookings: [overviewBooking({ verification: "unverified" })],
    tasks: [overviewTask()],
    packingLists: [{ id: "fixture-list" }],
    packingItems: [{ packed: true }, { packed: false }],
    documents: [{ state: "ready" }],
    allocations: [
      {
        id: "fixture-allocation",
        trip_id: completedTrip.id,
        currency: "EUR",
        category: "Other",
        day: null,
        destination_id: null,
        planned: 300,
        estimate_low: null,
        estimate_high: null,
        notes: "",
      },
    ],
    expenses: [
      {
        id: "fixture-expense",
        trip_id: completedTrip.id,
        amount: 75,
        currency: "EUR",
        category: "Other",
        day: "2027-05-03",
        payment_method: "card",
        notes: "",
      },
    ],
  });
