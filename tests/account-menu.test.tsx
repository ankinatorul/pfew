// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "../components/account-menu";
import { logout } from "../app/actions";
vi.mock("../app/actions", () => ({ logout: vi.fn(async () => {}) }));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const profile = {
  name: "Anca Traveler",
  email: "traveler@example.com",
  avatarUrl: "https://lh3.googleusercontent.com/a/photo",
  initials: "AT",
};
it("shows sign-in when no verified Google session exists", () => {
  render(<AccountMenu profile={null} />);
  expect(
    screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
  ).toBe("/login");
  expect(screen.queryByRole("button")).toBeNull();
});
it("shows Google account details and a working sign-out action", async () => {
  const user = userEvent.setup();
  render(<AccountMenu profile={profile} />);
  await user.click(
    screen.getByRole("button", { name: "Open account menu for Anca Traveler" }),
  );
  expect(screen.getByText("Signed in with Google")).toBeTruthy();
  expect(screen.getByText(profile.email)).toBeTruthy();
  expect(
    screen.getByRole("menuitem", { name: "Your account" }).getAttribute("href"),
  ).toBe("/profile");
  await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});
it("opens by keyboard and returns focus to the trigger on Escape", async () => {
  const user = userEvent.setup();
  render(<AccountMenu profile={profile} />);
  const trigger = screen.getByRole("button", {
    name: "Open account menu for Anca Traveler",
  });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("menu")).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
it("uses initials when the Google photo cannot load", () => {
  const { container } = render(<AccountMenu profile={profile} />);
  const image = container.querySelector("img")!;
  expect(image.getAttribute("src")).toBe(profile.avatarUrl);
  fireEvent.error(image);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("AT")).toBeTruthy();
});
