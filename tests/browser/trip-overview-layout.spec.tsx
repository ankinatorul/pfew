import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect, type Page } from "@playwright/test";
import { TripOverviewView } from "../../components/trip-overview-view";
import { AppShellView } from "../../components/app-shell-view";
import { tripOverview } from "../../lib/trip-overview";
import {
  overviewTrip as trip,
  overviewNow as now,
  overviewSegment,
  overviewTask,
  overviewBooking,
  overviewData,
} from "../fixtures/trip-overview";
import type { TripCard } from "../../lib/trip-collection";

// Isolated synthetic records only; render the real presenter and application CSS.
async function renderOverview(
  page: Page,
  state: "booked" | "empty" | "unknown" | "viewer" = "booked",
) {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  const current =
    state === "unknown"
      ? { ...trip, start_date: "", end_date: "", travelers: 0 }
      : trip;
  const model = tripOverview(
    current,
    state === "unknown" ? [] : [overviewSegment()],
    overviewData({
      bookings:
        state === "empty" || state === "unknown" ? [] : [overviewBooking()],
      tasks: state === "empty" || state === "unknown" ? [] : [overviewTask()],
      packingLists: [{ id: "fixture-list" }],
      packingItems: [{ packed: true }, { packed: false }],
      documents: [{ state: "ready" }],
    }),
    now,
  );
  const card: TripCard = {
    ...current,
    shared: state === "viewer",
    lifecycle: "upcoming",
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
            AT
          </button>
        </div>
      }
    >
      <TripOverviewView
        model={model}
        role={state === "viewer" ? "viewer" : "owner"}
        taskActions={{
          [overviewTask().id]: (
            <button className="button secondary">Mark done</button>
          ),
        }}
      />
    </AppShellView>,
  );
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles
        .map((url) => '<link rel="stylesheet" href="' + url + '">')
        .join("") +
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

test("upcoming dashboard uses a full-width canvas with preparation first and five real module links", async ({
  page,
}) => {
  await renderOverview(page);
  const overview = page.locator(".trip-overview");
  await expect(overview).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(overview).toHaveCSS("box-shadow", "none");
  await expect(overview).toHaveCSS("border-top-width", "0px");
  await expect(
    overview.getByRole("heading", { name: "What’s left to do" }),
  ).toBeVisible();
  const primary = overview.getByRole("region", { name: "What’s left to do" });
  await expect(primary.getByText("Saved task", { exact: true })).toBeVisible();
  await expect(
    primary.getByText("Suggested action", { exact: true }).first(),
  ).toBeVisible();
  const modules = overview.getByRole("region", { name: "Trip modules" });
  await expect(modules.getByRole("link")).toHaveCount(5);
  for (const section of [
    "Bookings",
    "Itinerary",
    "Packing",
    "Documents",
    "Budget",
  ]) {
    await expect(
      modules.getByRole("link", { name: new RegExp("^" + section) }),
    ).toHaveAttribute(
      "href",
      `/trips/${trip.id}?view=${section.toLowerCase()}&day=2027-05-01`,
    );
  }
  await expect(overview.getByRole("button", { name: /Trip actions/ })).toHaveCount(0);
  await expect(overview.getByRole("link", { name: "Edit trip" })).toHaveAttribute("href", `/trips/${trip.id}?view=settings&day=2027-05-01`);
  await expect(overview.getByRole("navigation", { name: "Trip overview sections" }).getByRole("link")).toHaveCount(6);
  const geometry = await page.evaluate(() => {
    const prep = document
      .querySelector(".overview-preparation")!
      .getBoundingClientRect();
    const modules = document
      .querySelector(".overview-modules")!
      .getBoundingClientRect();
    return { prepTop: prep.top, modulesTop: modules.top };
  });
  expect(geometry.prepTop).toBeLessThan(geometry.modulesTop);
  await page.screenshot({
    path: test.info().outputPath("trip-before-departure.png"),
    fullPage: true,
  });
});

test("dashboard fills remaining width on phones and wide desktops without an outer panel", async ({
  page,
}) => {
  await renderOverview(page);
  for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".app-main")!;
      const workspace = document.querySelector(".app-workspace")!;
      const overview = document.querySelector(".trip-overview")!;
      const style = getComputedStyle(main);
      return {
        fits: document.documentElement.scrollWidth <= innerWidth,
        main: main.getBoundingClientRect().width,
        workspace: workspace.getBoundingClientRect().width,
        overview: overview.getBoundingClientRect().width,
        available:
          main.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
      };
    });
    expect(layout.fits).toBe(true);
    expect(Math.abs(layout.main - layout.workspace)).toBeLessThan(1);
    expect(Math.abs(layout.overview - layout.available)).toBeLessThan(1);
  }
});

test("empty bookings and unknown dates remain honest and viewers retain read-only access", async ({
  page,
}) => {
  await renderOverview(page, "empty");
  await expect(
    page.getByText("No bookings saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Check your accommodation details", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("You may already have arrangements outside Pfew.", {
      exact: false,
    }),
  ).toBeVisible();
  await renderOverview(page, "unknown");
  await expect(page.locator(".overview-date-line")).toContainText(
    "Travel dates not saved",
  );
  await expect(page.locator(".overview-countdown")).toHaveCount(0);
  await expect(page.locator(".overview-status")).toHaveText("Travel dates need checking");
  await expect(page.getByRole("heading", { name: "Review your travel dates" })).toBeVisible();
  expect(await page.locator(".trip-overview").textContent()).not.toMatch(
    /NaN|Invalid Date/,
  );
  await renderOverview(page, "viewer");
  await expect(page.getByRole("status")).toContainText("view-only");
  await expect(page.getByRole("link", { name: "Edit trip" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark done" })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Trip modules" }).getByRole("link"),
  ).toHaveCount(5);
});
