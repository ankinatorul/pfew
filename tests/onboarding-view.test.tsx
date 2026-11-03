// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripOnboarding } from "../components/onboarding/onboarding";
import { emptyCandidate } from "../lib/onboarding";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function basics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Trip name"), "Summer in Japan");
  fireEvent.change(screen.getByLabelText("Departure"), {
    target: { value: "2027-06-12" },
  });
  fireEvent.change(screen.getByLabelText("Return"), {
    target: { value: "2027-06-26" },
  });
  await user.click(screen.getByRole("button", { name: "Continue" }));
}
it("allows a trip with no bookings or destinations, persists preferences and makes no automatic request", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        trip: {
          id: "trip",
          name: "Summer in Japan",
          start_date: "2027-06-12",
          end_date: "2027-06-26",
        },
        href: "/trips/trip?view=destinations",
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<TripOnboarding live={false} />);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toContain("Choose departure");
  await basics(user);
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText(/No bookings added yet/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Confirm details" }));
  await user.click(screen.getByRole("radio", { name: "Budget-friendly" }));
  await user.click(screen.getByRole("button", { name: "Nature" }));
  await user.click(screen.getByRole("button", { name: "Create my trip" }));
  await screen.findByRole("link", { name: "Continue with my trip" });
  expect(fetcher).toHaveBeenCalledOnce();
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(payload).toMatchObject({
    bookings: [],
    destinations: [],
    style: "Budget",
    interests: ["Nature"],
  });
});
it("processes multiple sources individually, retains successes on failure and retries only the failed file", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const fields = {
    ...emptyCandidate().fields,
    title: "My flight",
    category: "flight",
    start_date: "2027-06-12",
    end_date: "2027-06-12",
    currency: "EUR",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fields,
        evidence: {},
        warnings: [],
        method: "ai",
        importKey: crypto.randomUUID(),
      }),
    })
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Try this file again" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fields: { ...fields, title: "Return flight" },
        evidence: {},
        warnings: [],
        method: "ai",
        importKey: crypto.randomUUID(),
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<TripOnboarding live />);
  await basics(user);
  await user.upload(screen.getByLabelText("Booking PDFs or screenshots"), [
    new File(["file1"], "flight.pdf", { type: "application/pdf" }),
    new File(["file2"], "return.png", { type: "image/png" }),
  ]);
  await user.click(screen.getByLabelText(/Send these documents/));
  await user.click(
    screen.getByRole("button", { name: "Read selected bookings" }),
  );
  await screen.findByText("Try this file again");
  expect(fetcher).toHaveBeenCalledTimes(2);
  await user.click(
    screen.getByRole("button", { name: "Read selected bookings" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await waitFor(() =>
    expect(screen.getAllByText("Read · review required")).toHaveLength(2),
  );
  expect(
    fetcher.mock.calls.every(
      (call) => (call[1].body as FormData).getAll("file").length === 1,
    ),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Confirm details" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Review each included",
  );
  for (const summary of screen.getAllByText("Review required"))
    await user.click(summary);
  const reviews = screen.getAllByLabelText(/I reviewed these details/);
  for (const review of reviews) await user.click(review);
  expect(
    (
      screen.getAllByLabelText(
        "I confirm this reservation exists.",
      )[0] as HTMLInputElement
    ).checked,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Confirm details" }));
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      trip: {
        id: "trip",
        name: "Summer in Japan",
        start_date: "2027-06-12",
        end_date: "2027-06-26",
      },
      href: "/trips/trip?view=destinations",
    }),
  });
  await user.click(screen.getByRole("button", { name: "Create my trip" }));
  await screen.findByRole("heading", { name: "A great start." });
  expect(
    screen.getByText("Not added yet — that’s completely fine."),
  ).toBeTruthy();
  const payload = JSON.parse(fetcher.mock.calls[3][1].body);
  expect(
    payload.bookings.every(
      (b: { confirmed: boolean; reviewed: boolean }) =>
        b.reviewed && !b.confirmed,
    ),
  ).toBe(true);
  expect(fetcher.mock.calls[3][1].body).not.toContain("flight.pdf");
});
it("blocks saving offline or before the new schema is ready", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<TripOnboarding live={false} schemaReady={false} />);
  expect(
    (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/database migration 010/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(fetcher).not.toHaveBeenCalled();
});
