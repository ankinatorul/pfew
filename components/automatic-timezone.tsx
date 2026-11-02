"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
export function AutomaticTimezone({
  name = "timezone",
  value,
}: {
  name?: string;
  value?: string | null;
}) {
  const device = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
  return <input type="hidden" name={name} value={value || device} />;
}
