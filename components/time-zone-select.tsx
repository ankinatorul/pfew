"use client";
import { useEffect, useRef } from "react";
import zones from "../lib/time-zones.json";
const groups = [...new Set(zones.map((z) => z.split("/")[0]))].sort();
function valid(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
function label(zone: string) {
  return zone.split("/").at(-1)!.replaceAll("_", " ") + " · " + zone;
}
export function TimeZoneSelect({
  name,
  defaultValue,
  optional = false,
  autoDetect = false,
}: {
  name: string;
  defaultValue?: string | null;
  optional?: boolean;
  autoDetect?: boolean;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const selected =
    defaultValue && valid(defaultValue) ? defaultValue : optional ? "" : "UTC";
  useEffect(() => {
    if (autoDetect && !defaultValue && ref.current) {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone === "UTC" || zones.includes(zone)) ref.current.value = zone;
    }
  }, [autoDetect, defaultValue]);
  return (
    <select
      key={selected}
      ref={ref}
      name={name}
      required={!optional}
      defaultValue={selected}
    >
      {optional && <option value="">Not specified</option>}
      <option value="UTC">UTC · Coordinated Universal Time</option>
      {selected && selected !== "UTC" && !zones.includes(selected) && (
        <option value={selected}>{label(selected)} (saved)</option>
      )}
      {groups.map((group) => (
        <optgroup label={group} key={group}>
          {zones
            .filter((z) => z.startsWith(group + "/"))
            .map((zone) => (
              <option key={zone} value={zone}>
                {label(zone)}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
