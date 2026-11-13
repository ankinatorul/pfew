"use client";
import { z } from "zod";
import { useState, useEffect, useLayoutEffect, useId, useRef } from "react";
import {
  resolvedLocationSchema,
  type ResolvedLocation,
} from "../lib/location-types";
import {
  canSearchLocation,
  initialLocationSuggestions,
  locationQuery,
  LOCATION_QUERY_LIMIT,
  LOCATION_SEARCH_VERSION,
  LOCATION_RESULT_LIMIT,
  type LocationSearchScope,
} from "../lib/location-search";
const presentationSchema = z.record(
  z.string().max(2048),
  z.object({
    context: z.string().max(200),
    type: z.string().max(60).optional(),
  }),
);
type Presentations = z.infer<typeof presentationSchema>;
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
  const [presentations, setPresentations] = useState<Presentations>({});
  const [expanded, setExpanded] = useState(false);
  const [retryEpoch, setRetryEpoch] = useState(0);
  const [retryDelay, setRetryDelay] = useState(0);
  const cooldown = useRef(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
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
    new Map<
      string,
      {
        until: number;
        results: ResolvedLocation[];
        presentations: Presentations;
      }
    >(),
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
    if (!retryDelay) return;
    const timer = setTimeout(() => setRetryDelay(0), retryDelay * 1000);
    return () => clearTimeout(timer);
  }, [retryDelay]);
  useEffect(() => {
    if (
      selected ||
      composing ||
      !canSearchLocation(query) ||
      Date.now() < cooldown.current
    )
      return;
    const term = locationQuery(query);
    const key =
      scope + ":" + LOCATION_SEARCH_VERSION + ":" + term.toLowerCase();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const saved = cache.current.get(key);
        if (saved && saved.until > Date.now()) {
          setResults(saved.results);
          setPresentations(saved.presentations || {});
          setWorldwideAvailable(true);
          setSearchedQuery(term);
          setOpen(popupAllowed.current);
          return;
        }
        const response = await fetch(
          "/api/locations?q=" +
            encodeURIComponent(term) +
            "&scope=" +
            scope +
            "&v=" +
            LOCATION_SEARCH_VERSION,
          { signal: controller.signal },
        );
        if (!response.ok) {
          if (response.status === 429) {
            const wait = Math.min(
              120,
              Math.max(1, Number(response.headers.get("retry-after")) || 30),
            );
            cooldown.current = Date.now() + wait * 1000;
            setRetryDelay(wait);
            throw new Error("Search is busy. Try again shortly.");
          }
          throw new Error("Location search is unavailable.");
        }
        const data = await response.json();
        const parsed = resolvedLocationSchema
          .array()
          .max(LOCATION_RESULT_LIMIT)
          .safeParse(data.results);
        if (!parsed.success)
          throw new Error("Location search returned an unexpected response.");
        if (controller.signal.aborted) return;
        const metadata = presentationSchema.safeParse(data.presentations || {});
        const details = metadata.success ? metadata.data : {};
        const available = data.worldwideAvailable !== false;
        setWorldwideAvailable(available);
        setResults(parsed.data);
        setPresentations(details);
        if (!available) {
          setError(
            data.status === "rate_limited"
              ? "Search is busy. Try again shortly."
              : "Search is temporarily unavailable. Try again.",
          );
          const wait = Math.min(
            120,
            Math.max(1, Number(data.retryAfterSeconds) || 5),
          );
          cooldown.current = Date.now() + wait * 1000;
          setRetryDelay(wait);
        }
        setSearchedQuery(term);
        if (data.worldwideAvailable !== false) {
          if (cache.current.size >= 20)
            cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, {
            until: Date.now() + 300000,
            results: parsed.data,
            presentations: details,
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
  }, [query, selected, composing, scope, retryEpoch]);
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
  useLayoutEffect(() => {
    if (
      scope !== "destination" ||
      !open ||
      !results.length ||
      !popup.current ||
      !input.current ||
      !wrapper.current
    )
      return;
    const positionPopup = () => {
      const panel = popup.current,
        anchor = input.current,
        container = wrapper.current;
      if (!panel || !anchor || !container) return;
      const rect = anchor.getBoundingClientRect(),
        base = container.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0,
        bottom = top + (viewport?.height || window.innerHeight);
      const navigation = window.innerWidth < 768 ? 72 : 0;
      const below = bottom - rect.bottom - navigation - 10,
        above = rect.top - top - 10;
      const flip = below < 220 && above > below;
      panel.style.top = flip ? "auto" : `${rect.bottom - base.top + 4}px`;
      panel.style.bottom = flip ? `${base.bottom - rect.top + 4}px` : "auto";
      panel.style.maxHeight = `${Math.max(80, Math.min(324, Math.floor(flip ? above : below)))}px`;
    };
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    window.visualViewport?.addEventListener("resize", positionPopup);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
      window.visualViewport?.removeEventListener("resize", positionPopup);
    };
  }, [open, results.length, expanded, scope]);
  const choose = (location: ResolvedLocation) => {
    manualVersion.current++;
    popupAllowed.current = false;
    setLoading(false);
    setError("");
    setRetryDelay(0);
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
  const visibleResults =
    scope === "destination" && !expanded
      ? initialLocationSuggestions(results, presentations)
      : results;
  return (
    <div
      className="location-picker"
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          popupAllowed.current = false;
          setOpen(false);
          setActive(-1);
        }
      }}
    >
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
          setError(
            Date.now() < cooldown.current
              ? "Search is temporarily unavailable. Try again shortly."
              : "",
          );
          setExpanded(false);
          setPresentations({});
          setSearchedQuery("");
          callback.current?.(null);
          setOpen(true);
        }}
        onFocus={() => {
          popupAllowed.current = true;
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || composing) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            popupAllowed.current = true;
            setOpen(true);
            setActive((i) => Math.min(visibleResults.length - 1, i + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            popupAllowed.current = true;
            setOpen(true);
            setActive((i) =>
              visibleResults.length
                ? i < 0
                  ? visibleResults.length - 1
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
          if (
            e.key === "Enter" &&
            open &&
            active >= 0 &&
            visibleResults[active]
          ) {
            e.preventDefault();
            choose(visibleResults[active]);
          }
        }}
      />
      <input type="hidden" name={name} value={selected} />
      {titleName && (
        <input type="hidden" name={titleName} value={selected ? query : ""} />
      )}
      {open && results.length > 0 && (
        <div className="location-popup" ref={popup}>
          <ul
            id={id + "-results"}
            role="listbox"
            aria-label={label + " suggestions"}
            className="location-results"
          >
            {visibleResults.map((r, i) => (
              <li
                role="option"
                aria-label={
                  r.label +
                  (presentations[r.id]?.type
                    ? " · " + presentations[r.id].type
                    : "")
                }
                aria-selected={active === i}
                id={id + "-" + i}
                key={r.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
              >
                {scope === "destination" ? (
                  <>
                    <span className="location-result-name">{r.city}</span>
                    <span className="location-result-context">
                      {presentations[r.id]?.context ||
                        (r.label.startsWith(r.city + ", ")
                          ? r.label.slice(r.city.length + 2)
                          : r.country)}
                      {presentations[r.id]?.type
                        ? " · " + presentations[r.id].type
                        : ""}
                    </span>
                  </>
                ) : (
                  r.label
                )}
              </li>
            ))}
          </ul>
          {open &&
            scope === "destination" &&
            !expanded &&
            results.length > visibleResults.length && (
              <button
                type="button"
                className="location-more"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setExpanded(true);
                  setActive(-1);
                  input.current?.focus();
                }}
              >
                Show more results
              </button>
            )}
        </div>
      )}
      <span id={id + "-hint"} className="location-hint" role="status">
        {loading ||
        (!selected &&
          canSearchLocation(query) &&
          !composing &&
          !error &&
          searchedQuery !== locationQuery(query))
          ? "Finding places…"
          : error ||
            (!selected &&
            canSearchLocation(query) &&
            searchedQuery === locationQuery(query)
              ? results.length
                ? "Choose the matching place below."
                : "No matches. Try another spelling or add the country."
              : "")}
        {selected && !compact
          ? "Local time is set automatically from the selected map point."
          : ""}
      </span>
      {!selected && (error || !worldwideAvailable) && (
        <button
          type="button"
          className="location-retry"
          disabled={retryDelay > 0 || loading}
          onClick={() => {
            cache.current.delete(
              scope +
                ":" +
                LOCATION_SEARCH_VERSION +
                ":" +
                locationQuery(query).toLowerCase(),
            );
            popupAllowed.current = true;
            setExpanded(false);
            setRetryEpoch((value) => value + 1);
            input.current?.focus();
          }}
        >
          Retry
        </button>
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
