// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
const m = vi.hoisted(() => ({
  join: vi.fn(),
  rpc: vi.fn(),
  user: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../app/collaboration-actions", () => ({ joinSharedTrip: m.join }));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: m.user }));
vi.mock("../lib/supabase", () => ({ supabase: async () => ({ rpc: m.rpc }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: m.replace, refresh: m.refresh }),
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
}));
import Join from "../app/join/[token]/page";
import { JoinTrip } from "../components/join-trip";
const token = "a".repeat(64),
  trip = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  m.user.mockResolvedValue({ id: "editor" });
  m.rpc.mockResolvedValue({
    data: { state: "valid", trip_name: "Shared escape" },
    error: null,
  });
});
afterEach(cleanup);
it("signed-out holders see Google sign-in and a safe return path, no trip lookup or details", async () => {
  m.user.mockResolvedValue(null);
  render(await Join({ params: Promise.resolve({ token }) }));
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.join).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("link", { name: "Sign in with Google" })
      .getAttribute("href"),
  ).toBe("/login?next=" + encodeURIComponent("/join/" + token));
  expect(screen.queryByText(/Shared escape/)).toBeNull();
});
it("authenticated preview reveals only minimal context and joining is explicit, idempotent-click protected and opens the same trip", async () => {
  let finish!: (v: unknown) => void;
  m.join.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  render(await Join({ params: Promise.resolve({ token }) }));
  expect(m.join).not.toHaveBeenCalled();
  expect(screen.getByText(/Editor access/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Join trip" }));
  fireEvent.click(screen.getByRole("button", { name: "Joining…" }));
  expect(m.join).toHaveBeenCalledOnce();
  expect(m.join.mock.calls[0][0].get("token")).toBe(token);
  finish({ tripId: trip, status: "accepted" });
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/trips/" + trip));
  expect(localStorage.getItem("pfew:active-trip:editor")).toBe(trip);
});
it("existing members open the trip directly without another join", async () => {
  m.rpc.mockResolvedValue({
    data: { state: "already_member", trip_id: trip },
    error: null,
  });
  await expect(Join({ params: Promise.resolve({ token }) })).rejects.toThrow(
    "redirect:/trips/" + trip,
  );
  expect(m.join).not.toHaveBeenCalled();
});
it("disabled/reset links and unavailable RPCs expose no trip name or join button", async () => {
  m.rpc.mockResolvedValue({
    data: { state: "invalid", trip_name: "Secret" },
    error: null,
  });
  const view = render(await Join({ params: Promise.resolve({ token }) }));
  expect(screen.queryByRole("button", { name: "Join trip" })).toBeNull();
  expect(screen.queryByText(/Secret/)).toBeNull();
  m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  view.rerender(await Join({ params: Promise.resolve({ token }) }));
  expect(screen.getByText("Sharing isn’t available yet")).toBeTruthy();
});
it("failed acceptance leaves a friendly retry and never navigates", async () => {
  m.join.mockResolvedValue({ error: "This link is no longer available." });
  render(<JoinTrip state="valid" token={token} userId="editor" />);
  fireEvent.click(screen.getByRole("button", { name: "Join trip" }));
  await screen.findByRole("alert");
  expect(m.replace).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Join trip" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
