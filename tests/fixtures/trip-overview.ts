import type { Trip, Segment } from "../../lib/domain";
import type { Booking, Task } from "../../lib/essentials";
import type { TripOverviewData } from "../../lib/trip-overview";

export const overviewTrip: Trip = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "owner",
  name: "A saved spring journey",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: 1000,
};
export const overviewNow = new Date("2027-04-25T12:00:00Z");
export function overviewSegment(part: Partial<Segment> = {}): Segment {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    trip_id: overviewTrip.id,
    kind: "destination",
    title: "First saved destination",
    start_date: overviewTrip.start_date,
    end_date: overviewTrip.end_date,
    timezone: "UTC",
    local_time: "",
    status: "planned",
    address: "",
    provider: "",
    reference: "",
    origin: "",
    arrival_location: "",
    arrival_time: "",
    arrival_timezone: "",
    transport_mode: "",
    notes: "",
    position: 0,
    destination_id: null,
    ...part,
  };
}
export function overviewBooking(part: Partial<Booking> = {}): Booking {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    trip_id: overviewTrip.id,
    segment_id: null,
    title: "My saved accommodation",
    category: "accommodation",
    provider: "Saved provider",
    reference: "TEST-REF",
    start_date: overviewTrip.start_date,
    end_date: overviewTrip.end_date,
    local_time: "15:00",
    timezone: "UTC",
    end_local_time: "11:00",
    end_timezone: "UTC",
    origin: "",
    destination: "",
    travelers: "",
    notes: "",
    price: 400,
    paid_amount: 100,
    currency: "EUR",
    payment_status: "partial",
    verification: "user confirmed",
    ...part,
  };
}
export function overviewTask(part: Partial<Task> = {}): Task {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    trip_id: overviewTrip.id,
    title: "Review my saved insurance cover",
    category: "Health and insurance",
    due_date: "2027-04-28",
    priority: "normal",
    done: false,
    ...part,
  };
}
export function overviewData(
  part: Partial<TripOverviewData> = {},
): TripOverviewData {
  return {
    bookings: [],
    tasks: [],
    packingLists: [],
    packingItems: [],
    documents: [],
    allocations: [],
    expenses: [],
    includePrepaid: true,
    findings: [],
    decisions: [],
    ...part,
  };
}
