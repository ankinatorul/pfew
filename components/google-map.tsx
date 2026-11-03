"use client";
import { useRef, useEffect, useState } from "react";
import { useOnline } from "./essentials/online";
export type MapPin = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};
declare global {
  interface Window {
    pfewMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}
let mapsPromise: Promise<void> | null = null;
function loadMaps(key: string) {
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<void>((resolve, reject) => {
    window.pfewMapsReady = () => {
      delete window.pfewMapsReady;
      resolve();
    };
    window.gm_authFailure = () => {
      window.dispatchEvent(new Event("pfew-maps-error"));
      reject(new Error("Map authorization failed"));
    };
    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(key) +
      "&v=weekly&loading=async&callback=pfewMapsReady";
    script.async = true;
    script.onerror = () => {
      mapsPromise = null;
      script.remove();
      reject(new Error("Map could not load"));
    };
    document.head.appendChild(script);
  });
  return mapsPromise;
}
export function GoogleMap({
  pins,
  selected,
  onSelect,
}: {
  pins: MapPin[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const online = useOnline();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const hasPins = pins.length > 0;
  useEffect(() => {
    if (!key || !hasPins || !online) return;
    let cancelled = false;
    const authFailure = () =>
      setError(
        "Interactive map is unavailable. You can still use the saved-place list and Google Maps links.",
      );
    window.addEventListener("pfew-maps-error", authFailure);
    loadMaps(key)
      .then(() => {
        if (!cancelled && container.current && !map.current) {
          map.current = new google.maps.Map(container.current, {
            center: { lat: 0, lng: 0 },
            zoom: 2,
            mapTypeControl: false,
            streetViewControl: false,
          });
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) authFailure();
      });
    return () => {
      cancelled = true;
      window.removeEventListener("pfew-maps-error", authFailure);
    };
  }, [key, hasPins, online]);
  useEffect(() => {
    if (!ready || !map.current || !online) return;
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];
    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p, i) => {
      const marker = new google.maps.Marker({
        map: map.current,
        position: { lat: p.latitude, lng: p.longitude },
        title: p.label,
        label: String(i + 1),
      });
      marker.addListener("click", () => onSelect(p.id));
      markers.current.push(marker);
      bounds.extend({ lat: p.latitude, lng: p.longitude });
    });
    if (pins.length === 1) {
      map.current.setCenter({ lat: pins[0].latitude, lng: pins[0].longitude });
      map.current.setZoom(11);
    } else if (pins.length > 1) map.current.fitBounds(bounds);
    return () => {
      markers.current.forEach((m) => m.setMap(null));
      markers.current = [];
    };
  }, [ready, pins, onSelect, online]);
  useEffect(() => {
    const pin = pins.find((pin) => pin.id === selected);
    if (ready && online && map.current && pin) {
      map.current.panTo({ lat: pin.latitude, lng: pin.longitude });
    }
    markers.current.forEach((marker, index) => {
      const active = pins[index]?.id === selected;
      marker.setZIndex(active ? 1000 : index);
      marker.setOpacity(selected && !active ? 0.65 : 1);
    });
  }, [selected, pins, ready, online]);
  if (!key)
    return (
      <div className="empty">
        <h3>Your places, at a glance.</h3>
        <p>
          Interactive maps are unavailable for this deployment. Your saved trip
          locations and Open Google Maps links work below.
        </p>
      </div>
    );
  return (
    <section aria-label="Trip map">
      {!online && (
        <p role="status">
          Reconnect to use interactive maps. Downloaded trips remain available
          in the offline reader.
        </p>
      )}
      {error && (
        <p role="status" className="error">
          {error}
        </p>
      )}
      <div className="map-canvas" ref={container} hidden={!online} />
      {!hasPins && (
        <p className="muted">
          Save a located destination or city to add a map point.
        </p>
      )}
    </section>
  );
}
