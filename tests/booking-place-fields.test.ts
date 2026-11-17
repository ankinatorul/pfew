import { it, expect } from "vitest";
import { bookingPlaceFields } from "../lib/booking-place-fields";
import { geographicLocation } from "../lib/geographic-location";
it("decodes a stored Unicode place for display and retains the separate custom title/address", () => {
  const p = geographicLocation(
    "Hôtel des Fleurs",
    "Paris, France",
    48.8,
    2.3,
    "FR",
    "osm:N:123",
  );
  expect(
    bookingPlaceFields({
      title: "Honeymoon",
      location_id: p.id,
      location_label: p.label,
      latitude: p.latitude,
      longitude: p.longitude,
      destination: "Courtyard entrance",
    }),
  ).toMatchObject({
    place: "Hôtel des Fleurs",
    title: "Honeymoon",
    customTitle: true,
    address: "Courtyard entrance",
    linked: true,
  });
});
it("keeps manual and legacy place labels and does not claim a manual label is geolocated", () => {
  expect(
    bookingPlaceFields({
      title: "Custom stay",
      location_label: "Private room",
      destination: "Original address",
    }),
  ).toMatchObject({
    place: "Private room",
    title: "Custom stay",
    customTitle: true,
    linked: false,
  });
  expect(bookingPlaceFields({ title: "Manual booking" })).toMatchObject({
    place: "Manual booking",
    customTitle: false,
    linked: false,
  });
  expect(
    bookingPlaceFields({
      title: "Legacy",
      location_id: "opaque-legacy",
      location_label: "Original place",
    }),
  ).toMatchObject({ place: "Original place", linked: true });
});
