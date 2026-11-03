import { z } from "zod";
import type { ResolvedLocation } from "./location-types";
import { coordinateTimezone } from "./coordinate-timezone";
// These are user-selected geographic points, not authenticated provider records.
// The server validates the point and derives its zone rather than accepting one.
const pointSchema = z.tuple([
  z.string().trim().min(1).max(200),
  z.string().trim().max(200),
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
]);
export function geographicLocation(
  name: string,
  country: string,
  latitude: number,
  longitude: number,
  countryCode = "ZZ",
): ResolvedLocation {
  const point = pointSchema.parse([name, country, latitude, longitude]);
  const code = z
    .string()
    .regex(/^[A-Z]{2}$/)
    .parse(countryCode);
  // Retain the country-code prefix used by the existing official-source catalog.
  const id =
    "geo:" +
    code +
    ":" +
    Buffer.from(JSON.stringify(point), "utf8").toString("base64url");
  return {
    id,
    label: [point[0], point[1]].filter(Boolean).join(", ").slice(0, 200),
    city: point[0],
    country: point[1],
    latitude: point[2],
    longitude: point[3],
    timezone: coordinateTimezone(point[2], point[3]),
    source: "coordinates",
  };
}
export function resolveGeographicLocation(id: string): ResolvedLocation | null {
  const match = id.match(/^geo:([A-Z]{2}):([A-Za-z0-9_-]+)$/);
  if (!match || id.length > 2048) return null;
  try {
    const point = pointSchema.parse(
      JSON.parse(Buffer.from(match[2], "base64url").toString("utf8")),
    );
    const location = geographicLocation(...point, match[1]);
    return location.id === id ? location : null;
  } catch {
    return null;
  }
}
export function coordinatesFromInput(value: string): [number, number] | null {
  const pair = (text: string | null): [number, number] | null => {
    const match = text?.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (!match) return null;
    const lat = Number(match[1]),
      lon = Number(match[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
  };
  const direct = pair(value);
  if (direct) return direct;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (
      ["google.com", "www.google.com", "maps.google.com"].includes(
        url.hostname,
      ) &&
      (url.hostname === "maps.google.com" || url.pathname.startsWith("/maps"))
    ) {
      const query = pair(
        url.searchParams.get("query") || url.searchParams.get("q"),
      );
      if (query) return query;
      const pin = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if (pin) return pair(pin[1] + "," + pin[2]);
    }
    if (["openstreetmap.org", "www.openstreetmap.org"].includes(url.hostname)) {
      return pair(
        (url.searchParams.get("mlat") || "") +
          "," +
          (url.searchParams.get("mlon") || ""),
      );
    }
  } catch {
    /* A name alone cannot establish its time zone. */
  }
  return null;
}
