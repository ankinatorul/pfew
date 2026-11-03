import { createHash } from "node:crypto";
import type { Trip } from "./domain";
import type { Allocation, Booking } from "./essentials";
export function budgetContextKey(
  trip: Pick<Trip, "currency" | "budget" | "start_date" | "end_date">,
  include: boolean,
  allocations: Pick<
    Allocation,
    "id" | "planned" | "currency" | "day" | "destination_id"
  >[],
  bookings: Pick<Booking, "id" | "paid_amount" | "currency">[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        trip.currency,
        trip.budget,
        trip.start_date,
        trip.end_date,
        include,
        allocations
          .map((item) => [
            item.id,
            item.planned,
            item.currency,
            item.day,
            item.destination_id,
          ])
          .sort(),
        bookings
          .map((item) => [item.id, item.paid_amount, item.currency])
          .sort(),
      ]),
    )
    .digest("hex");
}
