// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AuthOptions } from "../components/auth-options";
vi.mock("../app/actions", () => ({ google: vi.fn() }));
afterEach(() => cleanup());
it("shows only Google and explains when its provider is disabled", () => {
  render(<AuthOptions providers={{ state: "ready", google: false }} />);
  expect(
    (
      screen.getByRole("button", {
        name: "Continue with Google",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.queryByLabelText("Email address")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("isn’t enabled");
});
it("offers retry when availability cannot be verified", () => {
  render(<AuthOptions providers={{ state: "unavailable", google: false }} />);
  expect(screen.getByRole("link", { name: "Try again" })).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});
it("enables Google when Supabase reports it enabled", () => {
  render(<AuthOptions providers={{ state: "ready", google: true }} />);
  expect(
    (
      screen.getByRole("button", {
        name: "Continue with Google",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(screen.queryByRole("textbox")).toBeNull();
});
