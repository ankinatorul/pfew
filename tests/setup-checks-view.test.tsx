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
import { SetupChecks } from "../components/setup-checks";
import type { SetupReport } from "../lib/setup-check-types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const report: SetupReport = {
  checkedAt: "2026-11-03T12:00:00.000Z",
  release: "phase-4",
  schemaVersionRequired: 9,
  commit: null,
  projectHost: "project.example.test",
  siteOrigin: "https://pfew.vercel.app",
  database: { passed: 23, total: 23 },
  scope:
    "Read checks do not establish write permissions or cross-account privacy.",
  checks: [
    {
      id: "ai",
      title: "Optional AI",
      state: "configured",
      group: "integrations",
      detail: "A key is present. Key validity has not been tested.",
    },
    {
      id: "saving",
      title: "Saving",
      state: "not_tested",
      group: "verification",
      detail: "Save and reopen a real trip.",
    },
  ],
};
it("makes no automatic requests, sends document opt-in only on approval, and copies the allowed report shape", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ...report, unexpectedPrivateData: "do-not-copy" }),
  });
  vi.stubGlobal("fetch", fetcher);
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(<SetupChecks />);
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Run read checks" }));
  await screen.findByText("Configured · live test pending");
  expect(screen.getByText("Not tested")).toBeTruthy();
  expect(fetcher.mock.calls[0][0]).toBe("/api/setup-checks?document=1");
  await user.click(
    screen.getByRole("button", { name: "Copy diagnostic report" }),
  );
  expect(JSON.parse(copy.mock.calls[0][0])).toEqual(report);
  expect(copy.mock.calls[0][0]).not.toContain("do-not-copy");
});
it("defaults to schema-only reads and offers manual copying when clipboard access fails", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("clipboard unavailable"),
  );
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => report });
  vi.stubGlobal("fetch", fetcher);
  render(<SetupChecks />);
  await user.click(screen.getByRole("button", { name: "Run read checks" }));
  await screen.findByText("Configured · live test pending");
  expect(fetcher.mock.calls[0][0]).toBe("/api/setup-checks");
  await user.click(
    screen.getByRole("button", { name: "Copy diagnostic report" }),
  );
  expect(
    JSON.parse(
      (screen.getByLabelText("Diagnostic report") as HTMLTextAreaElement).value,
    ),
  ).toEqual(report);
});
it("prevents checks while offline and shows an interrupted request without a success report", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const fetcher = vi
    .fn()
    .mockRejectedValue(new Error("Connection interrupted"));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<SetupChecks />);
  await user.click(screen.getByRole("button", { name: "Run read checks" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText("Reconnect to run setup checks.")).toBeTruthy();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  fireEvent(window, new Event("online"));
  await user.click(screen.getByRole("button", { name: "Run read checks" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Connection interrupted",
    ),
  );
  expect(
    screen.queryByRole("button", { name: "Copy diagnostic report" }),
  ).toBeNull();
});
