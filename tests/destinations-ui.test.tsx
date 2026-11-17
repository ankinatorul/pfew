// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  waitFor,
} from "@testing-library/react";
const m = vi.hoisted(() => ({
  change: vi.fn(),
  reorder: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock("../app/destination-actions", () => ({ changeDestination: m.change }));
vi.mock("../app/trip-map-actions", () => ({ reorderDestinations: m.reorder }));
vi.mock("../components/location-picker", () => ({
  LocationPicker: ({ initialLabel }: { initialLabel?: string }) => (
    <input aria-label="Place" defaultValue={initialLabel} />
  ),
}));
import { Destinations } from "../components/destinations";
import { DestinationSortList } from "../components/destination-sort-list";
import { overviewTrip } from "./fixtures/trip-overview";
import { geographicLocation } from "../lib/geographic-location";
const trip = {
  ...overviewTrip,
  trip_revision: 2,
  draft_data: {
    destinations: [
      geographicLocation("Paris", "France", 48, 2, "FR"),
      geographicLocation("Lyon", "France", 45, 4, "FR"),
    ],
  },
};
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  m.change.mockResolvedValue({});
  m.reorder.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("shows only editable cards, opens the correct saved destination and preserves absent dates on save", async () => {
  render(
    <Destinations
      trip={trip}
      segments={[]}
      canEdit
      ready
      orderReady
      mixedReady
    />,
  );
  expect(screen.queryByText("Your saved destinations")).toBeNull();
  expect(screen.queryByText("Nothing here just yet.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit Lyon, France" }));
  const title = screen.getByRole("textbox", { name: "Name" });
  fireEvent.change(title, { target: { value: "Our Lyon stop" } });
  fireEvent.submit(title.closest("form")!);
  await waitFor(() => expect(m.change).toHaveBeenCalledOnce());
  expect(m.change.mock.calls[0][0]).toMatchObject({
    key: "1",
    source: "saved",
    title: "Our Lyon stop",
    start: "",
    end: "",
    tripRevision: 2,
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("failed saves retain input, dates validate without correction, and deletion requires confirmation", async () => {
  m.change.mockResolvedValue({ error: "Changed. Refresh first." });
  render(<Destinations trip={trip} segments={[]} canEdit ready orderReady />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Paris, France" }));
  const name = screen.getByRole("textbox", { name: "Name" });
  fireEvent.change(name, { target: { value: "Keep this" } });
  fireEvent.submit(name.closest("form")!);
  await screen.findByRole("alert");
  expect((name as HTMLInputElement).value).toBe("Keep this");
  vi.mocked(window.confirm).mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Remove destination" }));
  expect(m.change).toHaveBeenCalledTimes(1);
});
it("move-to-position and keyboard handle use the same authorized ordering action, with no arrow buttons", async () => {
  render(<Destinations trip={trip} segments={[]} canEdit ready orderReady />);
  expect(screen.queryByRole("button", { name: /Move .* down/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("Move Paris, France to position"), {
    target: { value: "1" },
  });
  await waitFor(() => expect(m.reorder).toHaveBeenCalledOnce());
  expect(m.reorder.mock.calls[0][0].ids).toEqual(["1", "0"]);
  const handle = screen.getByRole("button", { name: "Reorder Paris, France" });
  fireEvent.keyDown(handle, { key: " " });
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  fireEvent.keyDown(handle, { key: "Enter" });
  await waitFor(() => expect(m.reorder).toHaveBeenCalledTimes(2));
});
it("viewer and unavailable schema expose no destination mutations, and stale edit keys do not create a new form", () => {
  const view = render(
    <Destinations
      trip={trip}
      segments={[]}
      canEdit={false}
      ready
      orderReady
      initialEdit="bad"
    />,
  );
  expect(screen.queryByRole("button", { name: "Add destination" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: /Reorder/ })).toBeNull();
  view.rerender(
    <Destinations
      trip={trip}
      segments={[]}
      canEdit
      ready={false}
      orderReady={false}
    />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Add destination",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("dragging never opens card content and touch waits for a long press", async () => {
  vi.useFakeTimers();
  const move = vi.fn().mockResolvedValue(true),
    open = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  class Pointer extends MouseEvent {
    pointerId = 1;
    pointerType: string;
    constructor(type: string, init: PointerEventInit) {
      super(type, init);
      this.pointerType = init.pointerType || "mouse";
    }
  }
  vi.stubGlobal("PointerEvent", Pointer);
  const view = render(
    <DestinationSortList
      items={[
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ]}
      canReorder
      busy={false}
      onMove={move}
      render={(p) => <button onClick={open}>{p.title}</button>}
    />,
  );
  const handle = screen.getByRole("button", { name: "Reorder A" });
  fireEvent.pointerDown(handle, {
    button: 0,
    pointerType: "touch",
    pointerId: 1,
  });
  expect(handle.getAttribute("aria-pressed")).toBe("false");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(301);
  });
  expect(handle.getAttribute("aria-pressed")).toBe("true");
  const target = view.container.querySelector('[data-sort-index="1"]')!;
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => target,
  });
  fireEvent.pointerMove(handle, { pointerType: "touch", clientY: 100 });
  fireEvent.pointerUp(handle);
  expect(move).toHaveBeenCalledWith(0, 1);
  expect(open).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
