import { z } from "zod";
import { resolvedLocationSchema } from "./location-types";
const cacheSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  name: z.string().max(120),
  start_date: z.string(),
  end_date: z.string(),
  updated_at: z.string(),
  rows: z
    .array(
      z.object({
        key: z.string(),
        query: z.string(),
        location: resolvedLocationSchema.nullable(),
      }),
    )
    .max(32),
});
export type LocalTripBasics = z.infer<typeof cacheSchema>;
const eventName = "pfew:trip-basics-change";
const prefix = (userId: string) => `pfew:trip-basics:${userId}:`;
export function readLocalBasics(userId: string, id: string) {
  try {
    return window.localStorage.getItem(prefix(userId) + id);
  } catch {
    return null;
  }
}
export function parseLocalBasics(text: string | null): LocalTripBasics | null {
  if (!text) return null;
  try {
    const result = cacheSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function writeLocalBasics(userId: string, value: LocalTripBasics) {
  try {
    window.localStorage.setItem(
      prefix(userId) + value.id,
      JSON.stringify(value),
    );
    window.dispatchEvent(new Event(eventName));
    return true;
  } catch {
    return false;
  }
}
export function localBasicsList(userId: string) {
  try {
    const entries: LocalTripBasics[] = [];
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix(userId))) continue;
      const value = parseLocalBasics(window.localStorage.getItem(key));
      if (value) entries.push(value);
    }
    return JSON.stringify(
      entries.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    );
  } catch {
    return "[]";
  }
}
export function subscribeLocalBasics(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(eventName, listener);
  };
}

// Clear only this owner's completed draft cache; never other independent drafts.
export function clearLocalBasics(userId: string, id: string) {
  try {
    window.localStorage.removeItem(prefix(userId) + id);
    window.dispatchEvent(new Event(eventName));
  } catch {
    /* Saved server state remains authoritative. */
  }
}
