const changeEvent = "pfew:active-trip-change";
const storageKey = (userId: string) => "pfew:active-trip:" + userId;

// Persist only the identifier; every read is resolved against fresh RLS-scoped trips.
export function readActiveTrip(userId: string) {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}
export function rememberActiveTrip(userId: string, tripId: string) {
  try {
    if (readActiveTrip(userId) === tripId) return;
    window.localStorage.setItem(storageKey(userId), tripId);
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    /* Navigation also works when browser storage is unavailable. */
  }
}
export function forgetActiveTrip(userId: string) {
  try {
    if (readActiveTrip(userId) === null) return;
    window.localStorage.removeItem(storageKey(userId));
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    /* A stale identifier is still rejected by resolveActiveTrip. */
  }
}
export function subscribeActiveTrip(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changeEvent, listener);
  };
}
