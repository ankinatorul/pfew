"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as LibreMap,
  AttributionControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapConfig } from "../lib/map-config";
import { mapGeoJSON, mapBounds, type MapPoint } from "../lib/trip-map";
export default function TripMapCanvas({
  destinations,
  places = [],
  selected,
  onSelect,
  connect = true,
  expanded = false,
}: {
  destinations: MapPoint[];
  places?: MapPoint[];
  selected: string;
  onSelect: (id: string) => void;
  connect?: boolean;
  expanded?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    instance = useRef<LibreMap | null>(null),
    callback = useRef(onSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    callback.current = onSelect;
  }, [onSelect]);
  const geo = useMemo(
    () => mapGeoJSON(destinations, expanded ? places : [], connect),
    [destinations, places, connect, expanded],
  );
  useEffect(() => {
    if (!container.current) return;
    let alive = true,
      map: LibreMap | null = null;
    const timer = setTimeout(() => {
      if (alive) setStatus("error");
    }, mapConfig.timeoutMs);
    try {
      setWorkerUrl(mapConfig.workerUrl);
      map = new LibreMap({
        container: container.current,
        style: mapConfig.style,
        center: [0, 20],
        zoom: 1.5,
        attributionControl: false,
        cooperativeGestures: !expanded,
      });
      instance.current = map;
      map.addControl(new AttributionControl({ compact: true }), "bottom-right");
      const current = map;
      map.on("load", () => {
        if (!alive) return;
        clearTimeout(timer);
        setStatus("ready");
        current.addSource("stops", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        current.addSource("places", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 40,
        });
        current.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        current.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#435BC9",
            "line-width": 2,
            "line-dasharray": [2, 3],
            "line-opacity": 0.7,
          },
        });
        current.addLayer({
          id: "clusters",
          type: "circle",
          source: "places",
          filter: ["has", "point_count"],
          paint: {
            "circle-radius": 17,
            "circle-color": "#D9B4EF",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
        current.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "places",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
        });
        current.addLayer({
          id: "places",
          type: "circle",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 8,
            "circle-color": [
              "match",
              ["get", "category"],
              "stay",
              "#435BC9",
              "activity",
              "#F45C39",
              "food",
              "#F0C7E9",
              "transport",
              "#666B76",
              "#D9B4EF",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        current.addLayer({
          id: "stops",
          type: "circle",
          source: "stops",
          paint: {
            "circle-radius": 21,
            "circle-color": "#435BC9",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
          },
        });
        current.addLayer({
          id: "numbers",
          type: "symbol",
          source: "stops",
          layout: {
            "text-field": ["to-string", ["get", "order"]],
            "text-size": 15,
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#fff" },
        });
        for (const layer of ["stops", "places"]) {
          current.on("click", layer, (e) => {
            if (
              layer === "places" &&
              current.queryRenderedFeatures(e.point, { layers: ["stops"] })
                .length
            )
              return;
            const id = e.features?.[0]?.properties?.id;
            if (typeof id === "string") callback.current(id);
          });
          current.on("mouseenter", layer, () => {
            current.getCanvas().style.cursor = "pointer";
          });
          current.on("mouseleave", layer, () => {
            current.getCanvas().style.cursor = "";
          });
        }
        current.on("click", "clusters", async (e) => {
          if (
            current.queryRenderedFeatures(e.point, { layers: ["stops"] }).length
          )
            return;
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          try {
            const zoom = await (
              current.getSource("places") as GeoJSONSource
            ).getClusterExpansionZoom(feature.properties!.cluster_id);
            if (alive)
              current.easeTo({
                center: feature.geometry.coordinates as [number, number],
                zoom,
                duration: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? 0
                  : 250,
              });
          } catch {
            /* Keep panel usable if a cluster changes during interaction. */
          }
        });
      });
      map.on("error", () => {
        if (alive && !current.isStyleLoaded()) {
          clearTimeout(timer);
          setStatus("error");
        }
      });
    } catch {
      queueMicrotask(() => {
        if (alive) setStatus("error");
      });
      clearTimeout(timer);
    }
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container.current);
    return () => {
      alive = false;
      clearTimeout(timer);
      observer.disconnect();
      map?.remove();
      instance.current = null;
    };
  }, [attempt, expanded]);
  useEffect(() => {
    const map = instance.current;
    if (status !== "ready" || !map) return;
    for (const [name, data] of Object.entries(geo)) {
      const id = name === "destinations" ? "stops" : name;
      (map.getSource(id) as GeoJSONSource)?.setData(data);
    }
  }, [geo, status]);
  useEffect(() => {
    const map = instance.current;
    if (status !== "ready" || !map) return;
    const points = [...destinations, ...(expanded ? places : [])].flatMap(
      (p) => (p.coordinates ? [p.coordinates] : []),
    );
    const bounds = mapBounds(points);
    if (bounds)
      map.fitBounds(bounds, {
        padding: 52,
        maxZoom: points.length === 1 ? 10 : 12,
        duration: 0,
      });
  }, [status, destinations, places, expanded]);
  useEffect(() => {
    const map = instance.current;
    if (status !== "ready" || !map) return;
    map.setPaintProperty("stops", "circle-color", [
      "case",
      ["==", ["get", "id"], selected],
      "#E0F57B",
      "#435BC9",
    ]);
    map.setPaintProperty("numbers", "text-color", [
      "case",
      ["==", ["get", "id"], selected],
      "#22252B",
      "#fff",
    ]);
    map.setPaintProperty("places", "circle-stroke-color", [
      "case",
      ["==", ["get", "id"], selected],
      "#435BC9",
      "#fff",
    ]);
    map.setPaintProperty("places", "circle-radius", [
      "case",
      ["==", ["get", "id"], selected],
      11,
      8,
    ]);
    const point = [...destinations, ...places].find((p) => p.id === selected);
    if (point?.coordinates && expanded)
      map.easeTo({
        center: point.coordinates,
        ...(point.category !== "destination"
          ? { zoom: Math.max(map.getZoom(), 14) }
          : {}),
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 200,
      });
  }, [selected, status, destinations, places, expanded]);
  const point = [...destinations, ...places].find((p) => p.id === selected);
  return (
    <div className="pfew-map-renderer">
      <div
        ref={container}
        className="pfew-map-canvas"
        role="region"
        aria-label="Interactive trip map. Use the destination list to select places."
      />
      {status === "loading" && (
        <div className="pfew-map-state" role="status">
          Opening your trip map…
        </div>
      )}
      {status === "error" && (
        <div className="pfew-map-state" role="status">
          <p>
            The map couldn’t load. Your saved places are still available below.
          </p>
          <button
            className="button"
            type="button"
            onClick={() => {
              setStatus("loading");
              setAttempt((a) => a + 1);
            }}
          >
            Retry map
          </button>
        </div>
      )}
      {point && status === "ready" && (
        <div className="pfew-map-label" role="status">
          {point.title}
        </div>
      )}
    </div>
  );
}
