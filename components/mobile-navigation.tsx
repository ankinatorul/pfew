"use client";
import { useEffect, useRef, type ElementType } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import type { NavigationLink as NavigationItem } from "../lib/app-navigation";
import { NavigationLink } from "./navigation-link";

export function MobileNavigation({
  primary,
  more,
  LinkComponent = "a",
}: {
  primary: NavigationItem[];
  more: NavigationItem[];
  LinkComponent?: ElementType;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        disclosure.current &&
        event.target instanceof Node &&
        !disclosure.current.contains(event.target)
      )
        disclosure.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <nav className="app-mobile-nav" aria-label="Mobile navigation">
      {primary
        .filter((item) =>
          ["home", "trips", "itinerary", "bookings"].includes(item.key),
        )
        .map((item) => (
          <NavigationLink
            key={item.key}
            item={item}
            LinkComponent={LinkComponent}
            compact
          />
        ))}
      <details
        className="app-more"
        ref={disclosure}
        onKeyDown={(event) => {
          if (event.key === "Escape" && disclosure.current) {
            disclosure.current.open = false;
            disclosure.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          className="app-nav-link"
          aria-label="More navigation"
          data-active={
            (more.some((item) => item.active) &&
              !primary.some((item) => item.active)) ||
            undefined
          }
        >
          <MoreHorizontal size={21} aria-hidden="true" />
          <span>More</span>
        </summary>
        <div
          className="app-more-panel"
          onClick={(event) => {
            if ((event.target as Element).closest("a") && disclosure.current)
              disclosure.current.open = false;
          }}
        >
          <p className="app-more-title">A little more for your trip</p>
          <nav aria-label="More trip sections" className="app-more-links">
            {more.map((item) => (
              <NavigationLink
                key={item.key}
                item={item}
                LinkComponent={LinkComponent}
              />
            ))}
            <LinkComponent className="app-nav-link" href="/trips/new">
              <Plus size={20} aria-hidden="true" />
              <span>Create a Trip</span>
            </LinkComponent>
          </nav>
        </div>
      </details>
    </nav>
  );
}
