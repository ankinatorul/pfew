import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect, type Page } from "@playwright/test";
import { AppShellView } from "../../components/app-shell-view";
import { TripOverviewView } from "../../components/trip-overview-view";
import { tripOverview } from "../../lib/trip-overview";
import {
  completedTrip as trip,
  completedNow as now,
  completedSegments,
  completedData,
} from "../fixtures/completed-trip";
import { overviewData } from "../fixtures/trip-overview";

async function renderRecap(
  page: Page,
  state: "saved" | "empty" | "viewer" | "unknown" | "unavailable" = "saved",
) {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  const current =
    state === "unknown"
      ? { ...trip, end_date: "" }
      : state === "empty"
        ? { ...trip, budget: null }
        : trip;
  const data =
    state === "saved" || state === "unavailable"
      ? completedData()
      : overviewData();
  if (state === "unavailable") {
    data.bookings = null;
    data.documents = null;
    data.expenses = null;
  }
  const model = tripOverview(
    current,
    state === "saved" || state === "unavailable" ? completedSegments : [],
    data,
    now,
  );
  const card = {
    ...current,
    shared: state === "viewer",
    lifecycle: "past" as const,
  };
  const markup = renderToStaticMarkup(
    <AppShellView
      trips={[card]}
      activeTrip={card}
      pathname={"/trips/" + trip.id}
      view="hub"
      day={model.dates.day || null}
      accountMenu={
        <div className="header-account">
          <button className="account-trigger" aria-label="Account menu">
            FT
          </button>
        </div>
      }
    >
      <TripOverviewView
        model={model}
        role={state === "viewer" ? "viewer" : "owner"}
      />
    </AppShellView>,
  );
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((url) => `<link rel="stylesheet" href="${url}">`).join("") +
      "</head><body>" +
      markup +
      "</body></html>",
  );
  await expect(page.locator(".trip-overview h1")).toHaveCSS(
    "font-weight",
    "800",
  );
  await page.evaluate(() => document.fonts.ready);
}

test("completed trips lead with a compact recap and real historical modules", async ({
  page,
}) => {
  await renderRecap(page);
  const recap = page.getByRole("region", {
    name: "Another adventure in the books.",
  });
  const modules = page.getByRole("region", { name: "Trip modules" });
  await expect(
    recap.getByText("Your journey, all in one place.", { exact: true }),
  ).toBeVisible();
  await expect(
    recap.getByText("First saved stop · Second saved stop", { exact: true }),
  ).toBeVisible();
  await expect(recap.getByText("10 days", { exact: true })).toBeVisible();
  await expect(page.locator(".overview-status")).toHaveText("Completed trip");
  await expect(page.locator(".overview-countdown")).toHaveCount(0);
  for (const title of [
    "What’s left to do",
    "Today’s plan",
    "A little inspiration for today",
  ])
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Trip actions|Mark done|Dismiss/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit trip" })).toHaveAttribute(
    "href",
    `/trips/${trip.id}?view=settings&day=2027-05-01`,
  );
  await expect(
    recap.getByRole("link", { name: "View itinerary" }),
  ).toHaveAttribute("href", `/trips/${trip.id}?view=itinerary&day=2027-05-01`);
  const pills = page
    .getByRole("navigation", { name: "Trip overview sections" })
    .getByRole("link");
  await expect(pills).toHaveText([
    "Overview",
    "Bookings",
    "Itinerary",
    "Packing",
    "Documents",
    "Budget",
  ]);
  await expect(modules.locator("h3")).toHaveText([
    "Itinerary",
    "Bookings",
    "Documents",
    "Budget",
    "Packing",
  ]);
  for (const section of [
    "Itinerary",
    "Bookings",
    "Documents",
    "Budget",
    "Packing",
  ]) {
    await expect(
      modules.getByRole("link", { name: new RegExp("^" + section) }),
    ).toHaveAttribute(
      "href",
      `/trips/${trip.id}?view=${section.toLowerCase()}&day=2027-05-01`,
    );
  }
  await expect(modules.getByRole("link", { name: /^Bookings/ })).toContainText(
    "0 user-confirmed",
  );
  const budget = modules.getByRole("link", { name: /^Budget/ });
  await expect(budget).toContainText("Target EUR");
  await expect(budget).toContainText("Planned EUR");
  await expect(budget).toContainText("Recorded: EUR 75.00");
  expect((await recap.boundingBox())!.y).toBeLessThan(
    (await modules.boundingBox())!.y,
  );
  await page.screenshot({
    path: test.info().outputPath("trip-recap.png"),
    fullPage: true,
  });
});

test("the completed dashboard stays full width and stacks naturally without overflow", async ({
  page,
}) => {
  await renderRecap(page);
  for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".trip-overview")!;
      const main = document.querySelector<HTMLElement>(".app-main")!;
      const style = getComputedStyle(main);
      return {
        fits: document.documentElement.scrollWidth <= innerWidth,
        maxWidth: style.maxWidth,
        background: getComputedStyle(root).backgroundColor,
        shadow: getComputedStyle(root).boxShadow,
        available:
          main.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        width: root.getBoundingClientRect().width,
        recap: document
          .querySelector(".overview-recap")!
          .getBoundingClientRect().top,
        glance: document
          .querySelector(".overview-glance")!
          .getBoundingClientRect().top,
        modules: document
          .querySelector(".overview-modules")!
          .getBoundingClientRect().top,
      };
    });
    expect(layout.fits).toBe(true);
    expect(layout.maxWidth).toBe("none");
    expect(layout.background).toBe("rgba(0, 0, 0, 0)");
    expect(layout.shadow).toBe("none");
    expect(Math.abs(layout.width - layout.available)).toBeLessThan(1);
    expect(layout.recap).toBeLessThan(layout.modules);
    if (width < 1200) expect(layout.recap).toBeLessThan(layout.glance);
  }
});

test("empty records, unavailable summaries, uncertain dates, and viewer access remain honest", async ({
  page,
}) => {
  await renderRecap(page, "empty");
  for (const text of [
    "No destinations saved",
    "No itinerary entries saved",
    "No bookings saved",
    "No private uploads",
    "No budget records saved",
    "No packing lists saved",
  ])
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  await renderRecap(page, "unavailable");
  const modules = page.getByRole("region", { name: "Trip modules" });
  await expect(modules.getByRole("link", { name: /^Bookings/ })).toContainText(
    "Summary unavailable",
  );
  await expect(modules.getByRole("link", { name: /^Documents/ })).toContainText(
    "Summary unavailable",
  );
  await expect(modules.getByRole("link", { name: /^Budget/ })).toContainText(
    "Budget summary unavailable",
  );
  await renderRecap(page, "unknown");
  await expect(
    page.getByRole("heading", { name: "Review your travel dates" }),
  ).toBeVisible();
  await expect(page.locator(".overview-recap")).toHaveCount(0);
  await expect(page.getByText("Completed trip", { exact: true })).toHaveCount(
    0,
  );
  await renderRecap(page, "viewer");
  await expect(page.getByRole("link", { name: "Edit trip" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("view-only");
  await expect(
    page.getByRole("region", { name: "Trip modules" }).getByRole("link"),
  ).toHaveCount(5);
});
