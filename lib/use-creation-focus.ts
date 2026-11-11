"use client";
import { useEffect, useRef } from "react";

// Step changes and asynchronous errors need a deliberate keyboard/screen-reader
// destination. No animation, timers, focus trap or extra navigation state.
export function useCreationFocus(
  stage: string,
  error = "",
  busy = false,
  enabled = true,
) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (enabled) headingRef.current?.focus();
  }, [stage, enabled]);
  useEffect(() => {
    if (enabled && error && !busy) errorRef.current?.focus();
  }, [error, busy, enabled]);
  return { headingRef, errorRef };
}
