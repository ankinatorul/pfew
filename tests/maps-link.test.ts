import { it, expect } from "vitest";
import {
  parseMapsLink,
  inspectQuickInput,
  mapsLinkForPlace,
} from "../lib/maps-link";
it("accepts supported Google Maps URLs, extracts identifiers and removes tracking", () => {
  const link = parseMapsLink(
    "https://www.google.com/maps/search/?api=1&query=Tokyo+park&query_place_id=ChIJ12345&g_st=app&utm_source=share#tracking",
  );
  expect(link).toMatchObject({
    query: "Tokyo park",
    placeId: "ChIJ12345",
    short: false,
  });
  expect(link?.url).not.toContain("tracking");
  expect(link?.url).not.toContain("g_st");
  expect(link?.url).not.toContain("utm_");
  expect(parseMapsLink("https://maps.google.com/?q=Kyoto")).toMatchObject({
    query: "Kyoto",
  });
  expect(
    parseMapsLink(mapsLinkForPlace("ChIJ12345", "My own label"))?.placeId,
  ).toBe("ChIJ12345");
});
it("keeps shortened links unexpanded and rejects unsafe or unsupported hosts and schemes", () => {
  expect(
    parseMapsLink("https://maps.app.goo.gl/Abc12345?g_st=app"),
  ).toMatchObject({
    short: true,
    placeId: null,
    url: "https://maps.app.goo.gl/Abc12345",
  });
  expect(parseMapsLink("https://goo.gl/maps/Abc12345")?.short).toBe(true);
  for (const value of [
    "javascript:alert(1)",
    "http://www.google.com/maps",
    "https://www.google.com.evil.example/maps",
    "https://evil.example/maps",
    "https://user:password@www.google.com/maps",
    "https://www.google.com:8080/maps",
    "https://www.google.com/url?url=https://evil.example",
    "https://goo.gl/notmaps/Abc12345",
    "https://maps.app.goo.gl/",
  ])
    expect(parseMapsLink(value)).toBeNull();
});
it("proposes only user-provided text and leaves a short-link label unknown", () => {
  expect(inspectQuickInput("Dinner idea\nAsk everyone first")).toMatchObject({
    title: "Dinner idea",
    notes: "Ask everyone first",
    maps: null,
  });
  expect(inspectQuickInput("https://maps.app.goo.gl/Abc12345").title).toBe("");
  expect(() => inspectQuickInput("https://untrusted.example/place")).toThrow(
    "supported",
  );
  expect(() => inspectQuickInput("")).toThrow();
});
