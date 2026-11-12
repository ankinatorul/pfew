"use client";
import { useState, useEffect, useId, useRef } from "react";
import {
  resolvedLocationSchema,
  type ResolvedLocation,
} from "../lib/location-types";
import {
  canSearchLocation,
  locationQuery,
  LOCATION_QUERY_LIMIT,
  LOCATION_RESULT_LIMIT,
  type LocationSearchScope,
} from "../lib/location-search";
export function LocationPicker({
  label,
  name = "location_id",
  titleName,
  initialId = "",
  initialLabel = "",
  required = false,
  onResolved,
  onQueryChange,
  scope = "place",
  invalid = false,
  errorDescriptionId,
  compact = false,
}: {
  label: string;
  name?: string;
  titleName?: string;
  initialId?: string | null;
  initialLabel?: string;
  required?: boolean;
  onResolved?: (location: ResolvedLocation | null) => void;
  onQueryChange?: (query: string) => void;
  scope?: LocationSearchScope;
  invalid?: boolean;
  errorDescriptionId?: string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState(initialLabel);
  const [selected, setSelected] = useState(initialId || "");
  const [results, setResults] = useState<ResolvedLocation[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [worldwideAvailable, setWorldwideAvailable] = useState(true);
  const [manualName, setManualName] = useState("");
  const [position, setPosition] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState("");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const popupAllowed = useRef(false);
  const manualVersion = useRef(0);
  const cache = useRef(
    new Map<string, { until: number; results: ResolvedLocation[] }>(),
  );
  const callback = useRef(onResolved);
  useEffect(() => {
    callback.current = onResolved;
  }, [onResolved]);
  useEffect(() => {
    input.current?.setCustomValidity(
      (required || query.trim().length > 0) && !selected
        ? "Choose a place from the search results."
        : "",
    );
  }, [required, selected, query]);
  useEffect(() => {
    if (selected || composing || !canSearchLocation(query)) return;
    const term = locationQuery(query);
    const key = scope + ":" + term.toLowerCase();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const saved = cache.current.get(key);
        if (saved && saved.until > Date.now()) {
          setResults(saved.results);
          setWorldwideAvailable(true);
          setSearchedQuery(term);
          setOpen(popupAllowed.current);
          return;
        }
        const response = await fetch(
          "/api/locations?q=" + encodeURIComponent(term) + "&scope=" + scope,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Location search is unavailable.");
        const data = await response.json();
        const parsed = resolvedLocationSchema
          .array()
          .max(LOCATION_RESULT_LIMIT)
          .safeParse(data.results);
        if (!parsed.success)
          throw new Error("Location search returned an unexpected response.");
        if (controller.signal.aborted) return;
        setWorldwideAvailable(data.worldwideAvailable !== false);
        setResults(parsed.data);
        setSearchedQuery(term);
        if (data.worldwideAvailable !== false) {
          if (cache.current.size >= 20)
            cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, {
            until: Date.now() + 300000,
            results: parsed.data,
          });
        }
        setOpen(popupAllowed.current);
        setActive(-1);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Location search failed.");
          setSearchedQuery(term);
          setWorldwideAvailable(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected, composing, scope]);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(id + "-" + active)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);
  useEffect(
    () => () => {
      manualVersion.current++;
    },
    [],
  );
  const choose = (location: ResolvedLocation) => {
    manualVersion.current++;
    popupAllowed.current = false;
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
    const version = ++manualVersion.current;
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
      if (version !== manualVersion.current) return;
      if (!response.ok) throw new Error(data.error || "Check this location.");
      choose(resolvedLocationSchema.parse(data.location));
      input.current?.focus();
    } catch (reason) {
      if (version !== manualVersion.current) return;
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
        maxLength={LOCATION_QUERY_LIMIT}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && results.length > 0}
        aria-controls={open && results.length > 0 ? id + "-results" : undefined}
        aria-activedescendant={
          open && active >= 0 && results[active] ? id + "-" + active : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={
          id +
          "-hint" +
          (invalid && errorDescriptionId ? " " + errorDescriptionId : "")
        }
        aria-busy={loading}
        autoComplete="off"
        value={query}
        required={required}
        placeholder="Search a country, city, island, region or place"
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onChange={(e) => {
          manualVersion.current++;
          popupAllowed.current = true;
          setLoading(false);
          setActive(-1);
          setQuery(e.target.value);
          onQueryChange?.(e.target.value);
          setSelected("");
          setResults([]);
          setError("");
          setSearchedQuery("");
          callback.current?.(null);
          setOpen(true);
        }}
        onFocus={() => {
          popupAllowed.current = true;
          setOpen(true);
        }}
        onBlur={() => {
          popupAllowed.current = false;
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || composing) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            popupAllowed.current = true;
            setOpen(true);
            setActive((i) => Math.min(results.length - 1, i + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            popupAllowed.current = true;
            setOpen(true);
            setActive((i) =>
              results.length
                ? i < 0
                  ? results.length - 1
                  : Math.max(0, i - 1)
                : -1,
            );
          }
          if (e.key === "Escape") {
            e.preventDefault();
            popupAllowed.current = false;
            setOpen(false);
            setActive(-1);
          }
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
        <ul
          id={id + "-results"}
          role="listbox"
          aria-label={label + " suggestions"}
          className="location-results"
        >
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
      <span id={id + "-hint"} className="location-hint" role="status">
        {loading ||
        (!selected &&
          canSearchLocation(query) &&
          !composing &&
          searchedQuery !== locationQuery(query))
          ? "Finding places…"
          : error ||
            (!selected &&
            canSearchLocation(query) &&
            searchedQuery === locationQuery(query)
              ? results.length
                ? "Choose the matching place below."
                : "No matches. Try a nearby town or add the country."
              : "")}
        {selected && !compact
          ? "Local time is set automatically from the selected map point."
          : ""}
      </span>
      {!selected && !worldwideAvailable && (
        <p className="location-hint">
          Search is temporarily limited. Try a nearby town or try again shortly.
        </p>
      )}
      {!selected && !compact && (
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
      <small
        className={
          "location-attribution" + (compact ? " compact-attribution" : "")
        }
      >
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
