import type { ResolvedLocation } from "./location-types";
export const tripThemes = [
  "Default",
  "Tropical",
  "City Break",
  "Ski",
  "Mountain",
] as const;
export type TripTheme = (typeof tripThemes)[number];
const text = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
// Conservative, explicit geographic matches. A name alone is insufficient.
function place(
  d: ResolvedLocation,
  name: RegExp,
  country: RegExp,
  lat: [number, number],
  lon: [number, number],
) {
  return (
    name.test(text(d.city + " " + d.label)) &&
    country.test(text(d.country)) &&
    d.latitude >= lat[0] &&
    d.latitude <= lat[1] &&
    d.longitude >= lon[0] &&
    d.longitude <= lon[1]
  );
}
export function automaticTripTheme(
  name: string,
  destinations: ResolvedLocation[],
): { theme: TripTheme; reason: string } {
  const title = text(name);
  const intents = [
    /\b(beach|tropical)\b/.test(title),
    /\b(city break|city weekend)\b/.test(title),
    /\b(ski|skiing|snowboard|snowboarding)\b/.test(title),
    /\b(hike|hiking|mountain|trek|trekking)\b/.test(title),
  ].filter(Boolean).length;
  if (intents > 1 || !destinations.length)
    return {
      theme: "Default",
      reason: "A versatile Default theme suits mixed or uncertain plans.",
    };
  const themes = destinations.map((d) => {
    if (
      place(d, /\bbali\b/, /^(indonesia|id)$/, [-9, -8], [114, 116]) &&
      /\b(beach|tropical|holiday)\b/.test(title)
    )
      return "Tropical";
    if (
      place(d, /\bparis\b/, /^(france|fr)$/, [48, 50], [1, 4]) &&
      /\b(weekend|city|break)\b/.test(title)
    )
      return "City Break";
    if (
      place(d, /\bzermatt\b/, /^(switzerland|ch)$/, [45, 47], [7, 9]) &&
      /\b(ski|skiing|snowboard|snowboarding)\b/.test(title)
    )
      return "Ski";
    if (
      place(
        d,
        /\b(dolomites|dolomiti|dolomiten)\b/,
        /^(italy|italia|it)$/,
        [45, 47.5],
        [10, 13.5],
      ) &&
      /\b(hike|hiking|mountain|trek|trekking)\b/.test(title)
    )
      return "Mountain";
    return "Default";
  });
  const theme = themes.every((t) => t === themes[0]) ? themes[0] : "Default";
  return {
    theme,
    reason:
      theme === "Default"
        ? "There isn't enough consistent geographic context for a specific theme."
        : `${theme} matches your trip name and the saved destination's name, country and coordinates.`,
  };
}
