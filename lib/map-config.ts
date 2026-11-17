// A public style URL only; no API key. Override for a compatible provider or
// self-hosted style without changing trip components. Provider has no SLA.
export const mapConfig = {
  style:
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
    "https://tiles.openfreemap.org/styles/positron",
  workerUrl: "/maplibre/maplibre-gl-worker.mjs",
  timeoutMs: 15000,
};
