import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect, type Page } from "@playwright/test";
import { AppShellView } from "../../components/app-shell-view";
import { TripOverviewView } from "../../components/trip-overview-view";
import { tripOverview } from "../../lib/trip-overview";
import {
  duringTrip as trip,
  duringNow as now,
  duringSegments,
  duringBooking,
  duringData,
} from "../fixtures/during-trip";

async function renderDashboard(
  page: Page,
  state:
    | "saved"
    | "bookings"
    | "empty"
    | "viewer"
    | "unknown"
    | "unavailable" = "saved",
) {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  const current = state === "unknown" ? { ...trip, end_date: "" } : trip;
  const segments = state === "saved" ? duringSegments : [];
  const data = duringData();
  if (["empty", "viewer", "unknown"].includes(state)) data.bookings = [];
  if (state === "unavailable") data.bookings = null;
  const model = tripOverview(current, segments, data, now);
  const card = {
    ...current,
    shared: state === "viewer",
    lifecycle: "traveling" as const,
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

test("today's saved plans lead, optional inspiration follows, and existing navigation/modules remain", async ({
  page,
}) => {
  await renderDashboard(page);
  const today = page.getByRole("region", { name: "Today’s plan" });
  const inspiration = page.getByRole("region", {
    name: "A little inspiration for today",
  });
  const modules = page.getByRole("region", { name: "Trip modules" });
  await expect(today).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What’s left to do" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Trip actions/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Traveling now · Day 3", { exact: true }),
  ).toBeVisible();
  await expect(
    today.getByText("Planned activity", { exact: true }),
  ).toBeVisible();
  await expect(
    today.getByText("Booking · status unknown", { exact: true }),
  ).toBeVisible();
  await expect(
    today.getByRole("link", { name: "My saved afternoon booking" }),
  ).toHaveAttribute(
    "href",
    `/trips/${trip.id}?view=bookings&day=2027-05-03&edit=${duringBooking().id}`,
  );
  await expect(
    today.getByRole("link", { name: "View full itinerary" }),
  ).toHaveAttribute("href", `/trips/${trip.id}?view=itinerary&day=2027-05-03`);
  await expect(
    inspiration.getByRole("link", { name: "An idea I saved" }),
  ).toHaveAttribute("href", `/trips/${trip.id}?view=ideas&day=2027-05-03`);
  await expect(
    page
      .getByRole("navigation", { name: "Trip overview sections" })
      .getByRole("link"),
  ).toHaveCount(6);
  await expect(modules.getByRole("link")).toHaveCount(5);
  expect((await today.boundingBox())!.y).toBeLessThan(
    (await inspiration.boundingBox())!.y,
  );
  expect((await inspiration.boundingBox())!.y).toBeLessThan(
    (await modules.boundingBox())!.y,
  );
  await page.screenshot({
    path: test.info().outputPath("trip-during-travel.png"),
    fullPage: true,
  });
});

test("the live dashboard fills the canvas at phone, tablet, desktop and wide widths", async ({
  page,
}) => {
  await renderDashboard(page);
  for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".app-main")!;
      const root = document.querySelector<HTMLElement>(".trip-overview")!;
      const style = getComputedStyle(main);
      return {
        fits: document.documentElement.scrollWidth <= innerWidth,
        maxWidth: style.maxWidth,
        frame: getComputedStyle(root).boxShadow,
        width: root.getBoundingClientRect().width,
        available:
          main.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        today: document
          .querySelector(".overview-today")!
          .getBoundingClientRect().top,
        suggestions: document
          .querySelector(".overview-inspiration")!
          .getBoundingClientRect().top,
        glance: document
          .querySelector(".overview-glance")!
          .getBoundingClientRect().top,
      };
    });
    expect(layout.fits).toBe(true);
    expect(layout.maxWidth).toBe("none");
    expect(layout.frame).toBe("none");
    expect(Math.abs(layout.width - layout.available)).toBeLessThan(1);
    expect(layout.today).toBeLessThan(layout.suggestions);
    if (width < 1200) expect(layout.suggestions).toBeLessThan(layout.glance);
  }
});

test("booking-only, empty, unavailable and incomplete-date states are honest and viewers have no edit actions", async ({
  page,
}) => {
  await renderDashboard(page, "bookings");
  await expect(
    page.getByRole("region", { name: "Today’s plan" }).getByRole("listitem"),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Open Research" })).toBeVisible();
  await renderDashboard(page, "empty");
  await expect(
    page.getByText("Nothing planned for today. Your day is yours.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add an activity" }),
  ).toHaveAttribute(
    "href",
    `/trips/${trip.id}?view=add&day=2027-05-03&kind=activity`,
  );
  await renderDashboard(page, "unavailable");
  await expect(
    page.getByText("Nothing planned for today. Your day is yours.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByText(/Bookings could not be loaded/)).toBeVisible();
  await renderDashboard(page, "unknown");
  await expect(
    page.getByRole("heading", { name: "Review your travel dates" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today’s plan" })).toHaveCount(
    0,
  );
  await expect(page.getByText(/Traveling now/)).toHaveCount(0);
  await renderDashboard(page, "viewer");
  await expect(page.getByRole("link", { name: "Edit trip" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add an activity" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Trip modules" }).getByRole("link"),
  ).toHaveCount(5);
});
