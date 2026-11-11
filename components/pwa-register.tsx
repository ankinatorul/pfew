"use client";
import { useEffect } from "react";
export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A stale localhost worker can hide a stopped dev server behind the reader.
      // Unregister only Pfew's root worker; keep caches and encrypted copies intact.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter(
                (registration) =>
                  registration.scope === new URL("/", location.href).href &&
                  [
                    registration.active,
                    registration.waiting,
                    registration.installing,
                  ].some((worker) => {
                    if (!worker) return false;
                    const script = new URL(worker.scriptURL);
                    return (
                      script.origin === location.origin &&
                      script.pathname === "/sw.js"
                    );
                  }),
              )
              .map((registration) => registration.unregister()),
          ),
        )
        .catch(() => {});
      return;
    }
    // Registration caches only public reader assets, never trip pages or APIs.
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
