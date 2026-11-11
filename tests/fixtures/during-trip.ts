import type { Segment } from "../../lib/domain";
import type { Booking } from "../../lib/essentials";
import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
  overviewData,
} from "./trip-overview";

export const duringNow = new Date("2027-05-03T10:30:00Z");
export const duringTrip = { ...overviewTrip, name: "A saved city journey" };
export const duringDestination = overviewSegment({
  title: "Saved destination",
});
export const duringActivity = (part: Partial<Segment> = {}): Segment =>
  overviewSegment({
    id: "66666666-6666-4666-8666-666666666666",
    kind: "activity",
    title: "My saved morning activity",
    start_date: "2027-05-03",
    end_date: "2027-05-03",
    local_time: "09:00",
    duration_minutes: 60,
    address: "Saved meeting address",
    destination_id: duringDestination.id,
    ...part,
  });
export const duringBooking = (part: Partial<Booking> = {}): Booking =>
  overviewBooking({
    title: "My saved afternoon booking",
    category: "activity",
    start_date: "2027-05-03",
    end_date: "2027-05-03",
    local_time: "14:00",
    end_local_time: "15:00",
    ...part,
  });
export const duringSegments = [
  duringDestination,
  duringActivity(),
  overviewSegment({
    id: "77777777-7777-4777-8777-777777777777",
    title: "An idea I saved",
    kind: "activity",
    status: "idea",
    destination_id: duringDestination.id,
  }),
];
export const duringData = () =>
  overviewData({
    bookings: [duringBooking()],
    packingLists: [{ id: "fixture-list" }],
    packingItems: [{ packed: true }, { packed: false }],
    documents: [{ state: "ready" }],
  });
