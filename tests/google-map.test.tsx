// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { GoogleMap } from "../components/google-map";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("synchronizes marker selection/filtering and retains its map when the connection returns", async () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "fixture-browser-key");
  const apiMap = {
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    fitBounds: vi.fn(),
    panTo: vi.fn(),
  };
  const instances: {
    setMap: ReturnType<typeof vi.fn>;
    setOpacity: ReturnType<typeof vi.fn>;
    setZIndex: ReturnType<typeof vi.fn>;
    click?: () => void;
  }[] = [];
  const MapConstructor = vi.fn(function () {
    return apiMap;
  });
  vi.stubGlobal("google", {
    maps: {
      Map: MapConstructor,
      LatLngBounds: class {
        extend() {}
      },
      Marker: class {
        setMap = vi.fn();
        setOpacity = vi.fn();
        setZIndex = vi.fn();
        click?: () => void;
        constructor() {
          instances.push(this);
        }
        addListener(_: string, callback: () => void) {
          this.click = callback;
        }
      },
    },
  });
  const onSelect = vi.fn();
  const pins = [
    { id: "a", label: "First", latitude: 35, longitude: 139 },
    { id: "b", label: "Second", latitude: 48, longitude: 2 },
  ];
  const view = render(
    <GoogleMap pins={pins} selected="" onSelect={onSelect} />,
  );
  await waitFor(() => expect(instances).toHaveLength(2));
  instances[1].click?.();
  expect(onSelect).toHaveBeenCalledWith("b");
  view.rerender(<GoogleMap pins={pins} selected="b" onSelect={onSelect} />);
  expect(apiMap.panTo).toHaveBeenLastCalledWith({ lat: 48, lng: 2 });
  expect(instances[1].setOpacity).toHaveBeenLastCalledWith(1);
  expect(instances[0].setOpacity).toHaveBeenLastCalledWith(0.65);
  view.rerender(<GoogleMap pins={[pins[0]]} selected="" onSelect={onSelect} />);
  expect(instances[1].setMap).toHaveBeenCalledWith(null);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  await screen.findByText(/Reconnect to use interactive maps/);
  expect(document.querySelector(".map-canvas")?.hasAttribute("hidden")).toBe(
    true,
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  fireEvent(window, new Event("online"));
  await waitFor(() =>
    expect(document.querySelector(".map-canvas")?.hasAttribute("hidden")).toBe(
      false,
    ),
  );
  expect(MapConstructor).toHaveBeenCalledTimes(1);
});
it("does not load the SDK without a configured browser key", () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
  render(
    <GoogleMap
      pins={[{ id: "a", label: "City", latitude: 0, longitude: 0 }]}
      selected=""
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText(/Interactive maps are unavailable/)).toBeTruthy();
  expect(
    document.querySelector('script[src*="maps.googleapis.com"]'),
  ).toBeNull();
});
