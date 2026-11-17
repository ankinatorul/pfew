// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  act,
  cleanup,
  fireEvent,
} from "@testing-library/react";
const m = vi.hoisted(() => ({ maps: [] as MockMap[] }));
type MockMap = {
  events: Record<string, ((e?: unknown) => void)[]>;
  getSource: ReturnType<typeof vi.fn>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};
vi.mock("maplibre-gl", () => ({
  AttributionControl: class {},
  setWorkerUrl: vi.fn(),
  Map: class {
    events: MockMap["events"] = {};
    getSource = vi.fn(() => ({
      setData: vi.fn(),
      getClusterExpansionZoom: async () => 14,
    }));
    setPaintProperty = vi.fn();
    easeTo = vi.fn();
    remove = vi.fn();
    resize = vi.fn();
    fitBounds = vi.fn();
    addControl = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    getZoom = () => 8;
    getCanvas = () => ({ style: { cursor: "" } });
    isStyleLoaded = () => false;
    constructor() {
      m.maps.push(this);
    }
    on(event: string, layer: unknown, callback?: unknown) {
      const key = callback ? `${event}:${layer}` : event;
      (this.events[key] ||= []).push(
        (callback || layer) as (e?: unknown) => void,
      );
    }
  },
}));
import Canvas from "../components/trip-map-canvas";
const stops = [
  {
    id: "a",
    title: "Paris",
    category: "destination" as const,
    order: 1,
    coordinates: [2, 48] as [number, number],
    href: "",
  },
];
afterEach(() => {
  cleanup();
  m.maps.length = 0;
  vi.unstubAllGlobals();
});
function globals() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
}
it("loads once, updates GeoJSON/selection without reinitializing and removes the renderer on unmount", () => {
  globals();
  const select = vi.fn();
  const view = render(
    <Canvas destinations={stops} selected="" onSelect={select} expanded />,
  );
  expect(screen.getByRole("status").textContent).toContain("Opening");
  const map = m.maps[0];
  act(() => map.events.load[0]());
  expect(map.getSource).toHaveBeenCalledWith("stops");
  act(() =>
    map.events["click:stops"][0]({ features: [{ properties: { id: "a" } }] }),
  );
  expect(select).toHaveBeenCalledWith("a");
  view.rerender(
    <Canvas destinations={stops} selected="a" onSelect={select} expanded />,
  );
  expect(m.maps).toHaveLength(1);
  expect(screen.getByText("Paris")).toBeTruthy();
  expect(map.easeTo).toHaveBeenCalled();
  view.unmount();
  expect(map.remove).toHaveBeenCalledOnce();
});
it("provider/style failure has a friendly retry while the destination panel remains outside the renderer", () => {
  globals();
  render(<Canvas destinations={stops} selected="" onSelect={vi.fn()} />);
  act(() => m.maps[0].events.error[0]());
  expect(screen.getByText(/map couldn’t load/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  expect(m.maps).toHaveLength(2);
  expect(m.maps[0].remove).toHaveBeenCalled();
});
