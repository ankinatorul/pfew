import { it, expect } from "vitest";
import {
  searchLocations,
  resolveLocation,
  coordinateTimezone,
} from "../lib/locations";
it("derives real city time zones without a paid provider", () => {
  for (const [name, zone] of [
    ["Bucharest", "Europe/Bucharest"],
    ["Tokyo", "Asia/Tokyo"],
    ["Sydney", "Australia/Sydney"],
    ["New York", "America/New_York"],
  ]) {
    const location = searchLocations(name)[0];
    expect(location.timezone).toBe(zone);
    expect(resolveLocation(location.id)).toEqual(location);
  }
});
it("offers choices for ambiguous cities rather than guessing", () => {
  const result = searchLocations("Springfield");
  expect(result.length).toBeGreaterThan(1);
  expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
  expect(resolveLocation("invented-city")).toBeNull();
});
it("looks up geographic zones and rejects invalid coordinates", () => {
  expect(coordinateTimezone(35.685, 139.751)).toBe("Asia/Tokyo");
  expect(() => coordinateTimezone(200, 1)).toThrow();
});
