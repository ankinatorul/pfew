// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAdd } from "../components/quick-add";
import { TravelNotes } from "../components/travel-notes";
import { quickAdd } from "../app/planning-actions";
vi.mock("../app/planning-actions", () => ({
  quickAdd: vi.fn(async () => ({ savedId: "saved", view: "ideas" })),
  updateDayPlan: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const trip = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Trip",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "Asia/Tokyo",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: null,
};
it("previews a short Maps link privately, requires a personal label and saves an unscheduled idea", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <QuickAdd
      trip={trip}
      destinations={[]}
      day={trip.start_date}
      livePlaces={false}
    />,
  );
  await user.type(
    screen.getByLabelText("Place name, address, note or Google Maps link"),
    "https://maps.app.goo.gl/Abc12345",
  );
  await user.click(screen.getByRole("button", { name: "Preview item" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(quickAdd).not.toHaveBeenCalled();
  expect(
    (screen.getByLabelText("Your name for this item") as HTMLInputElement)
      .value,
  ).toBe("");
  await user.click(screen.getByRole("button", { name: "Save this item" }));
  expect(quickAdd).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText("Your name for this item"),
    "A dinner possibility",
  );
  await user.click(screen.getByRole("button", { name: "Save this item" }));
  await waitFor(() => expect(quickAdd).toHaveBeenCalledOnce());
  const form = vi.mocked(quickAdd).mock.calls[0][1];
  expect(form.get("mode")).toBe("idea");
  expect(form.get("day")).toBe("");
  expect(form.get("maps_link")).toBe("https://maps.app.goo.gl/Abc12345");
  expect(form.get("timezone")).toBeNull();
  await screen.findByRole("heading", { name: "Saved to Ideas." });
});
it("allows a plain address to be used explicitly and discarded without saving", async () => {
  const user = userEvent.setup();
  render(
    <QuickAdd
      trip={trip}
      destinations={[]}
      day={trip.start_date}
      livePlaces={false}
    />,
  );
  await user.type(
    screen.getByLabelText("Place name, address, note or Google Maps link"),
    "The address I know",
  );
  await user.click(screen.getByRole("button", { name: "Preview item" }));
  await user.click(
    screen.getByRole("button", { name: "Use my input as the address" }),
  );
  expect(
    (screen.getByLabelText("Your address · optional") as HTMLInputElement)
      .value,
  ).toBe("The address I know");
  await user.click(screen.getByRole("button", { name: "Discard preview" }));
  expect(quickAdd).not.toHaveBeenCalled();
});
it("renders only supported Maps links as clickable notes", () => {
  render(
    <TravelNotes
      text={
        "Google Maps link: https://www.google.com/maps/search/?api=1&query=Kyoto\nOther https://evil.example/phishing"
      }
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link").getAttribute("href")).toContain(
    "google.com/maps",
  );
  expect(screen.getByText(/evil.example/)).toBeTruthy();
});

it("disables adding while offline without queuing a mutation", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(
    <QuickAdd
      trip={trip}
      destinations={[]}
      day={trip.start_date}
      livePlaces={false}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("Reconnect");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Preview item" }));
  expect(quickAdd).not.toHaveBeenCalled();
});
