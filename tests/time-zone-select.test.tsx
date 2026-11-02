// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeZoneSelect } from "../components/time-zone-select";
afterEach(cleanup);
it("provides valid choices and submits the selected IANA value", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <form>
      <label>
        Trip time zone
        <TimeZoneSelect name="timezone" defaultValue="Europe/Bucharest" />
      </label>
    </form>,
  );
  const select = screen.getByRole("combobox", {
    name: "Trip time zone",
  }) as HTMLSelectElement;
  expect(select.value).toBe("Europe/Bucharest");
  await user.selectOptions(select, "Asia/Tokyo");
  expect(new FormData(container.querySelector("form")!).get("timezone")).toBe(
    "Asia/Tokyo",
  );
  expect(select.required).toBe(true);
  expect([...select.options].length).toBeGreaterThan(350);
  for (const option of select.options)
    expect(
      () => new Intl.DateTimeFormat("en", { timeZone: option.value }),
    ).not.toThrow();
});
it("keeps optional arrival zones unknown until selected", () => {
  render(
    <label>
      Arrival time zone
      <TimeZoneSelect name="arrival_timezone" optional />
    </label>,
  );
  const select = screen.getByRole("combobox") as HTMLSelectElement;
  expect(select.value).toBe("");
  expect(select.required).toBe(false);
});
it("preserves a valid saved alias instead of overwriting trip data", () => {
  render(<TimeZoneSelect name="timezone" defaultValue="Etc/UTC" />);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
    "Etc/UTC",
  );
});
