// @vitest-environment jsdom
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingImport } from "../components/booking-import";
import { overviewTrip } from "./fixtures/trip-overview";
it("retires the legacy import editor in favor of the canonical Bookings screen", () => {
  render(<BookingImport trip={overviewTrip} segments={[]} live={false} />);
  expect(
    screen
      .getByRole("link", { name: "Open your bookings" })
      .getAttribute("href"),
  ).toBe(`/trips/${overviewTrip.id}?view=bookings`);
  expect(document.querySelector("form")).toBeNull();
});
