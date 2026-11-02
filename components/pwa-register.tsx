"use client";
import { useEffect } from "react";
export function PWARegister() {
  useEffect(() => {
    // Registration caches only public reader assets, never trip pages or APIs.
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
  }, []);
  return null;
}
