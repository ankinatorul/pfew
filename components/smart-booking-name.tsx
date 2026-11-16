"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  resolvedLocationSchema,
  type ResolvedLocation,
} from "../lib/location-types";
import { canSearchLocation, locationQuery } from "../lib/location-search";
import type {
  BookingPlaceKind,
  SearchCenter,
} from "../lib/booking-place-search";

type Match = { place: ResolvedLocation; context: string; type?: string };
const cache = new Map<string, { until: number; matches: Match[] }>();
export function SmartBookingName({
  value,
  kind,
  centers,
  onChange,
  onSelect,
}: {
  value: string;
  kind: BookingPlaceKind;
  centers: SearchCenter[];
  onChange: (name: string) => void;
  onSelect: (place: ResolvedLocation) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    cooldown = useRef(0);
  const [open, setOpen] = useState(false),
    [typed, setTyped] = useState(false),
    [matches, setMatches] = useState<Match[]>([]),
    [status, setStatus] = useState<
      "idle" | "loading" | "ok" | "empty" | "unavailable"
    >("idle"),
    [active, setActive] = useState(-1);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(id + "-option-" + active)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [active, id]);
  const query = locationQuery(value),
    near = JSON.stringify(centers),
    requestKey = kind + ":" + near + ":" + query;
  useEffect(() => {
    if (!open || !typed || !canSearchLocation(query)) return;
    const abort = new AbortController();
    let current = true;
    const timer = window.setTimeout(async () => {
      setActive(-1);
      const hit = cache.get(requestKey);
      if (hit && hit.until > Date.now()) {
        setMatches(hit.matches);
        setStatus(hit.matches.length ? "ok" : "empty");
        return;
      }
      if (cooldown.current > Date.now()) {
        setMatches([]);
        setStatus("unavailable");
        return;
      }
      setStatus("loading");
      try {
        const response = await fetch(
          "/api/locations?" +
            new URLSearchParams({
              q: query,
              scope: "place",
              booking: kind,
              near,
            }),
          { signal: abort.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!current) return;
        if (!response.ok || !data.worldwideAvailable) {
          cooldown.current =
            Date.now() +
            Math.min(120, Math.max(5, Number(data.retryAfterSeconds) || 5)) *
              1000;
          setMatches([]);
          setStatus("unavailable");
          return;
        }
        if (!Array.isArray(data.results)) throw new Error("Invalid response");
        const seen = new Set<string>();
        const next: Match[] = data.results
          .flatMap((raw: unknown) => {
            const parsed = resolvedLocationSchema.safeParse(raw);
            if (
              !parsed.success ||
              seen.has(parsed.data.providerId || parsed.data.id)
            )
              return [];
            seen.add(parsed.data.providerId || parsed.data.id);
            const detail = data.presentations?.[parsed.data.id];
            return [
              {
                place: parsed.data,
                context:
                  typeof detail?.context === "string"
                    ? detail.context
                    : parsed.data.country,
                type:
                  typeof detail?.type === "string" ? detail.type : undefined,
              },
            ];
          })
          .slice(0, 5);
        if (cache.size >= 40) cache.delete(cache.keys().next().value!);
        cache.set(requestKey, {
          until: Date.now() + (next.length ? 180000 : 30000),
          matches: next,
        });
        setMatches(next);
        setStatus(next.length ? "ok" : "empty");
      } catch {
        if (current && !abort.signal.aborted) {
          setMatches([]);
          setStatus("unavailable");
        }
      }
    }, 400);
    return () => {
      current = false;
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [query, kind, near, requestKey, open, typed]);
  const visible = open && typed && !!query;
  const choose = (index: number) => {
    const match = matches[index];
    if (match) onSelect(match.place);
    setOpen(false);
    setMatches([]);
    setActive(-1);
  };
  return (
    <div
      className="smart-booking-name"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label htmlFor={id}>Name</label>
      <input
        id={id}
        name="title"
        required
        maxLength={200}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? id + "-results" : undefined}
        aria-activedescendant={
          visible && active >= 0 ? id + "-option-" + active : undefined
        }
        onFocus={() => {
          if (typed) setOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setTyped(true);
          setOpen(true);
          setMatches([]);
          setActive(-1);
          setStatus("idle");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && visible) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (
            visible &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();
            setActive((index) =>
              event.key === "ArrowDown"
                ? (index + 1) % (matches.length + 1)
                : index <= 0
                  ? matches.length
                  : index - 1,
            );
          }
          if (event.key === "Enter" && visible && active >= 0) {
            event.preventDefault();
            choose(active);
          }
        }}
      />
      {visible && (
        <div className="booking-name-popup">
          {status === "loading" && <small role="status">Searching…</small>}
          <ul id={id + "-results"} role="listbox" aria-label="Matching places">
            {matches.map((match, index) => (
              <li
                key={match.place.id}
                id={id + "-option-" + index}
                role="option"
                aria-selected={active === index}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  <strong>{match.place.city}</strong>
                  <small>
                    {[match.context, match.type].filter(Boolean).join(" · ")}
                  </small>
                </button>
              </li>
            ))}
            <li
              id={id + "-option-" + matches.length}
              role="option"
              aria-selected={active === matches.length}
            >
              <button
                type="button"
                tabIndex={-1}
                className="booking-name-custom"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(matches.length)}
              >
                Use “{value.trim()}”
              </button>
            </li>
          </ul>
          {status === "unavailable" && (
            <small role="status">
              Suggestions unavailable. You can still use this name.
            </small>
          )}
          {matches.length > 0 && (
            <small className="booking-name-attribution">
              ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap
              </a>{" "}
              · Photon
            </small>
          )}
        </div>
      )}
    </div>
  );
}
