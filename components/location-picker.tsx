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
  const [worldwideAvailable, setWorldwideAvailable] = useState(true);
  const [manualName, setManualName] = useState("");
  const [position, setPosition] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState("");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const callback = useRef(onResolved);
  useEffect(() => {
    callback.current = onResolved;
  }, [onResolved]);
  useEffect(() => {
    input.current?.setCustomValidity(
      (required || query.trim().length > 0) && !selected
        ? "Choose a place from the results, or add its map position."
        : "",
    );
  }, [required, selected, query]);
  useEffect(() => {
    if (selected || query.trim().length < 2 || query.length > 100) return;
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
        if (controller.signal.aborted) return;
        setWorldwideAvailable(data.worldwideAvailable !== false);
        setResults(parsed.data);
        setOpen(true);
        setActive(-1);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Location search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 500);
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
  async function useManualLocation() {
    setManualBusy(true);
    setManualError("");
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: manualName, position }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Check this location.");
      choose(resolvedLocationSchema.parse(data.location));
    } catch (reason) {
      setManualError(
        reason instanceof Error
          ? reason.message
          : "This location could not be added.",
      );
    } finally {
      setManualBusy(false);
    }
  }
  return (
    <div className="location-picker">
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        type="text"
        maxLength={500}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && results.length > 0}
        aria-controls={id + "-results"}
        aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
        autoComplete="off"
        value={query}
        required={required}
        placeholder="Search any island, town, region or place"
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
          ? "Finding places…"
          : error ||
            (!selected && query.length >= 2
              ? results.length
                ? "Choose the matching place below."
                : "Try adding a country, or add a place using its map position below."
              : "")}
        {selected ? "Local time is set automatically from this location." : ""}
      </span>
      {!selected && !worldwideAvailable && (
        <p className="location-hint">
          Worldwide search is temporarily unavailable. City results may still
          appear; you can add any named place using its map position below.
        </p>
      )}
      {!selected && (
        <details
          className="location-manual"
          onToggle={(event) => {
            if (event.currentTarget.open && !manualName)
              setManualName(query.trim().slice(0, 200));
          }}
        >
          <summary>Can’t find it? Add a place from its map position</summary>
          <p className="muted">
            Use any island, beach, village or other place. Copy its coordinates
            from your map; its time zone will be set automatically.
          </p>
          <label htmlFor={id + "-manual-name"}>Place name</label>
          <input
            id={id + "-manual-name"}
            value={manualName}
            maxLength={200}
            onChange={(event) => setManualName(event.target.value)}
            placeholder="Koh Phangan"
          />
          <label htmlFor={id + "-position"}>Coordinates or map link</label>
          <input
            id={id + "-position"}
            value={position}
            maxLength={1500}
            onChange={(event) => setPosition(event.target.value)}
            placeholder="9.73, 100.01"
          />
          <p className="muted">
            Paste latitude, longitude or a full Google Maps/OpenStreetMap pin
            link. Short share links need to be opened in your map first.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={manualBusy || !manualName.trim() || !position.trim()}
            onClick={useManualLocation}
          >
            {manualBusy ? "Setting location…" : "Use this location"}
          </button>
          {manualError && <p role="alert">{manualError}</p>}
        </details>
      )}
      <small className="location-attribution">
        Worldwide search:{" "}
        <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">
          Photon
        </a>{" "}
        ·{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
      </small>
    </div>
  );
}
