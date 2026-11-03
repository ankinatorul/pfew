// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PfewContextMenu } from "../components/pfew/context-menu";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("keeps edit/move in a keyboard-accessible menu and requires confirmation before calling the existing delete action", async () => {
  const user = userEvent.setup(),
    remove = vi.fn<(form: FormData) => Promise<void>>(async () => {}),
    confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <PfewContextMenu
      tripId="trip"
      itemId="destination"
      title="Tokyo"
      deleteAction={remove}
    />,
  );
  expect(screen.queryByText("Edit details")).toBeNull();
  await user.tab();
  await user.keyboard("{Enter}");
  const edit = await screen.findByRole("menuitem", { name: "Edit details" });
  expect(edit.getAttribute("href")).toBe(
    "/trips/trip?view=add&edit=destination",
  );
  expect(
    screen.getByRole("menuitem", { name: "Change dates / move" }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("menuitem", { name: "Delete destination" }),
  );
  expect(confirm).toHaveBeenCalledOnce();
  expect(remove).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await user.click(
    screen.getByRole("menuitem", { name: "Delete destination" }),
  );
  await waitFor(() => expect(remove).toHaveBeenCalledOnce());
  const form = remove.mock.calls[0][0] as FormData;
  expect(form.get("trip_id")).toBe("trip");
  expect(form.get("id")).toBe("destination");
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Options for Tokyo" }),
  );
});
it("retains read-only offline behavior instead of queueing mutations", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const user = userEvent.setup(),
    remove = vi.fn<(form: FormData) => Promise<void>>(async () => {});
  render(
    <PfewContextMenu
      tripId="trip"
      itemId="destination"
      title="Tokyo"
      deleteAction={remove}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Options for Tokyo" }));
  expect(
    await screen.findByText("Reconnect to edit this journey."),
  ).toBeTruthy();
  expect(
    screen.queryByRole("menuitem", { name: "Delete destination" }),
  ).toBeNull();
  expect(
    screen
      .getByRole("menuitem", { name: "Edit details" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
});
