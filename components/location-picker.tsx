"use client";
import { useState, useEffect, useId, useRef } from "react";
import {
  resolvedLocationSchema,
  type ResolvedLocation,
} from "../lib/location-types";
export function LocationPicker({
  label,
  name = "location_id",
  titleName,
  initialId = "",
  initialLabel = "",
  required = false,
  onResolved,
}: {
  label: string;
  name?: string;
  titleName?: string;
  initialId?: string | null;
  initialLabel?: string;
  required?: boolean;
  onResolved?: (location: ResolvedLocation | null) => void;
}) {
  const [query, setQuery] = useState(initialLabel);
  const [selected, setSelected] = useState(initialId || "");
  const [results, setResults] = useState<ResolvedLocation[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const callback = useRef(onResolved);
  useEffect(() => {
    callback.current = onResolved;
  }, [onResolved]);
  useEffect(() => {
    input.current?.setCustomValidity(
      (required || query.trim().length > 0) && !selected
        ? "Choose a city from the results."
        : "",
    );
  }, [required, selected, query]);
  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          "/api/locations?q=" + encodeURIComponent(query),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Location search is unavailable.");
        const data = await response.json();
        const parsed = resolvedLocationSchema
          .array()
          .max(8)
          .safeParse(data.results);
        if (!parsed.success)
          throw new Error("Location search returned an unexpected response.");
        setResults(parsed.data);
        setOpen(true);
        setActive(-1);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Location search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);
  const choose = (location: ResolvedLocation) => {
    setLoading(false);
    setError("");
    setQuery(location.label);
    setSelected(location.id);
    setResults([]);
    setOpen(false);
    setActive(-1);
    callback.current?.(location);
  };
  return (
    <div className="location-picker">
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        type="text"
        maxLength={100}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && results.length > 0}
        aria-controls={id + "-results"}
        aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
        autoComplete="off"
        value={query}
        required={required}
        placeholder="Search a city, region or country"
        onChange={(e) => {
          setLoading(false);
          setActive(-1);
          setQuery(e.target.value);
          setSelected("");
          setResults([]);
          callback.current?.(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(results.length - 1, i + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open && active >= 0 && results[active]) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      />
      <input type="hidden" name={name} value={selected} />
      {titleName && (
        <input type="hidden" name={titleName} value={selected ? query : ""} />
      )}
      {open && results.length > 0 && (
        <ul id={id + "-results"} role="listbox" className="location-results">
          {results.map((r, i) => (
            <li
              role="option"
              aria-selected={active === i}
              id={id + "-" + i}
              key={r.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
      <span className="location-hint" role="status">
        {loading
          ? "Finding cities…"
          : error ||
            (!selected && query.length >= 2
              ? results.length
                ? "Choose the matching city below."
                : "Choose a matching city; try adding a country if needed."
              : "")}
        {selected ? "Local time is set automatically from this city." : ""}
      </span>
    </div>
  );
}
