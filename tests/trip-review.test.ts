import { it, expect } from "vitest";
import { automaticTripTheme } from "../lib/trip-theme";
import { geographicLocation } from "../lib/geographic-location";
import { storedTravelStyle, travelStyleLabel } from "../lib/trip-style";
import { bookingReviewStamp } from "../lib/trip-review";
import { emptyCollectionEntry } from "../lib/booking-collection";
import { savedTripDestinations } from "../lib/trip-destinations";
import { overviewTrip, overviewData } from "./fixtures/trip-overview";
import { tripOverview } from "../lib/trip-overview";
const paris = geographicLocation("Paris", "France", 48.85, 2.35, "FR"),
  bali = geographicLocation("Bali", "Indonesia", -8.4, 115.2, "ID"),
  zermatt = geographicLocation("Zermatt", "Switzerland", 46.02, 7.75, "CH"),
  dolomites = geographicLocation("Dolomites", "Italy", 46.4, 11.8, "IT");
it("keeps approved style labels compatible with the existing database and defaults to Balanced", () => {
  expect(["Budget", "Comfort", "Luxury"].map(travelStyleLabel)).toEqual([
    "Budget",
    "Balanced",
    "Premium",
  ]);
  expect(travelStyleLabel("")).toBe("Balanced");
  expect(storedTravelStyle("Balanced")).toBe("Comfort");
  expect(storedTravelStyle("Premium")).toBe("Luxury");
});
it("assigns explainable themes conservatively from trip intent and matching geographic context", () => {
  for (const [name, dest, theme] of [
    ["Bali beach holiday", bali, "Tropical"],
    ["Paris weekend", paris, "City Break"],
    ["Skiing in Zermatt", zermatt, "Ski"],
    ["Hiking in the Dolomites", dolomites, "Mountain"],
  ] as const)
    expect(automaticTripTheme(name, [dest]).theme).toBe(theme);
  expect(
    automaticTripTheme("Paris weekend", [
      geographicLocation("Paris", "United States", 33.66, -95.55, "US"),
    ]).theme,
  ).toBe("Default");
  expect(automaticTripTheme("Weekend away", [paris, bali]).theme).toBe(
    "Default",
  );
  expect(automaticTripTheme("Ski and beach holiday", [bali]).theme).toBe(
    "Default",
  );
  expect(automaticTripTheme("Uncertain adventure", [paris]).theme).toBe(
    "Default",
  );
  expect(automaticTripTheme("Paris weekend", []).theme).toBe("Default");
});
it("stamps every booking revision consistently without depending on display order", () => {
  const a = emptyCollectionEntry("11111111-1111-4111-8111-111111111111"),
    b = emptyCollectionEntry("22222222-2222-4222-8222-222222222222");
  expect(bookingReviewStamp([b, a])).toEqual(bookingReviewStamp([a, b]));
  expect(bookingReviewStamp([a, { ...b, revision: 2 }])).not.toEqual(
    bookingReviewStamp([a, b]),
  );
});
it("preserves ordered destinations in finalized metadata without inventing dated itinerary entries", () => {
  const trip = { ...overviewTrip, draft_data: { destinations: [paris, bali] } };
  expect(savedTripDestinations(trip).map((d) => d.label)).toEqual([
    paris.label,
    bali.label,
  ]);
  const model = tripOverview(
    trip,
    [],
    overviewData(),
    new Date("2027-04-25T12:00:00Z"),
  );
  expect(model.destination).toBe(paris.label);
  expect(model.destinations).toHaveLength(2);
  expect(model.itinerary.total).toBe(0);
});
