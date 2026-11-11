import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect, type Page } from "@playwright/test";
import {
  HomeView,
  HomeEssentialsView,
  HomeTripsView,
} from "../../components/home-view";
import { AppShellView } from "../../components/app-shell-view";
import { homeSummary } from "../../lib/home-summary";
import type { Trip, Segment } from "../../lib/domain";
import type { Booking, Task } from "../../lib/essentials";
import type { TripCard } from "../../lib/trip-collection";

// Synthetic records are confined to tests. Render the actual Home and sidebar;
// there is no fixture route, provider call, or database mutation in the app.
const trip: Trip = {
  id: "fixture-trip",
  name: "A saved coastal adventure",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: null,
};
const card: TripCard = { ...trip, shared: false, lifecycle: "upcoming" };
const otherTrips = [
  { ...card, id: "fixture-other", name: "A weekend away" },
  { ...card, id: "fixture-shared", name: "Our next journey", shared: true },
];

async function renderHome(
  page: Page,
  state: "upcoming" | "traveling" | "empty" = "upcoming",
) {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  const traveling = state === "traveling";
  const summary = homeSummary(
    trip,
    {
      tasks: [
        {
          id: "task-one",
          title: "Review the saved travel documents",
          done: false,
          due_date: "2027-04-28",
        },
        {
          id: "task-two",
          title: "Choose what to pack",
          done: true,
          due_date: null,
        },
      ] as Task[],
      bookings: [
        {
          id: "booking",
          title: "Saved train reservation",
          category: "ground transport",
          start_date: "2027-05-02",
          end_date: "2027-05-02",
          local_time: "13:00",
          end_local_time: "14:00",
          timezone: "UTC",
          end_timezone: "UTC",
          verification: "user confirmed",
        },
      ] as Booking[],
      segments: [
        {
          id: "activity",
          kind: "activity",
          title: "Morning walk",
          status: "planned",
          start_date: "2027-05-02",
          end_date: "2027-05-02",
          local_time: "09:00",
          timezone: "UTC",
          position: 0,
        },
      ] as Segment[],
      packing: [{ packed: true }, { packed: false }],
      documents: [{ state: "ready" }],
    },
    new Date(traveling ? "2027-05-02T08:00:00Z" : "2027-04-25T12:00:00Z"),
  );
  const markup = renderToStaticMarkup(
    <AppShellView
      trips={state === "empty" ? [] : [card, ...otherTrips]}
      activeTrip={state === "empty" ? null : card}
      pathname="/"
      view="hub"
      day={null}
      accountMenu={
        <div className="header-account">
          <button className="account-trigger" aria-label="Account menu">
            AT
          </button>
        </div>
      }
    >
      <HomeView
        firstName="Traveler"
        trip={state === "empty" ? null : trip}
        stage={state === "empty" ? null : traveling ? "traveling" : "upcoming"}
        countdown={6}
      >
        {state !== "empty" && (
          <>
            <HomeEssentialsView summary={summary} traveling={traveling} />
            <HomeTripsView trips={otherTrips} />
          </>
        )}
      </HomeView>
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
  await expect(page.locator(".home-hq h1")).toHaveCSS("font-weight", "800");
  await page.evaluate(() => document.fonts.ready);
}

test("Home follows the Default theme and keeps real module links and the approved sidebar", async ({
  page,
}) => {
  await renderHome(page);
  const home = page.locator(".home-hq");
  await expect(home.getByRole("heading", { level: 1 })).toHaveText(
    "Less oh no.More let’s go.",
  );
  await expect(
    home.getByRole("link", { name: "Open trip: A saved coastal adventure" }),
  ).toHaveAttribute("href", "/trips/fixture-trip");
  await expect(home.getByRole("link", { name: /Packing/ })).toHaveAttribute(
    "href",
    "/trips/fixture-trip?view=packing",
  );
  await expect(home.getByText("50% packed")).toBeVisible();
  await expect(home.getByText("1 private file")).toBeVisible();
  await expect(
    home.getByRole("heading", { name: "Other trips" }),
  ).toBeVisible();
  await expect(home.locator("img")).toHaveCount(0);
  await expect(home).toHaveCSS("background-image", "none");
  await expect(home).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(home).toHaveCSS("border-top-width", "0px");
  await expect(home).toHaveCSS("border-radius", "0px");
  await expect(home).toHaveCSS("box-shadow", "none");
  expect(
    await home.evaluate((element) =>
      Array.from(element.children)
        .slice(0, 3)
        .map((child) => child.className),
    ),
  ).toEqual(["home-welcome", "home-featured-trip", "home-summary-grid"]);
  if (page.viewportSize()!.width >= 1024)
    await expect(
      page.locator('.app-sidebar a[aria-current="page"]'),
    ).toHaveText("Home");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("home-default.png"),
    fullPage: true,
  });
});

test("Home keeps today's plans and uses the available width from phones to wide desktops", async ({
  page,
}) => {
  await renderHome(page, "traveling");
  const home = page.locator(".home-hq");
  await expect(home.getByText("Today · Day 2")).toBeVisible();
  await expect(
    home.locator(".home-agenda").getByText("Morning walk", { exact: true }),
  ).toBeVisible();
  await expect(home.getByRole("link", { name: "View today" })).toHaveAttribute(
    "href",
    "/trips/fixture-trip?view=itinerary&day=2027-05-02",
  );
  for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      home.getByRole("link", { name: "Create a trip" }),
    ).toBeVisible();
    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".app-main")!;
      const workspace = document.querySelector<HTMLElement>(".app-workspace")!;
      const home = document.querySelector<HTMLElement>(".home-hq")!;
      const hero = document.querySelector<HTMLElement>(".home-welcome")!;
      const featured = document.querySelector<HTMLElement>(
        ".home-featured-trip",
      )!;
      const mainStyle = getComputedStyle(main);
      return {
        mainWidth: main.getBoundingClientRect().width,
        workspaceWidth: workspace.getBoundingClientRect().width,
        homeWidth: home.getBoundingClientRect().width,
        contentWidth:
          main.clientWidth -
          parseFloat(mainStyle.paddingLeft) -
          parseFloat(mainStyle.paddingRight),
        heroWidth: hero.getBoundingClientRect().width,
        featuredWidth: featured.getBoundingClientRect().width,
        statusWidths: Array.from(
          home.querySelectorAll(".home-summary-card"),
          (card) => card.getBoundingClientRect().width,
        ),
      };
    });
    expect(Math.abs(layout.mainWidth - layout.workspaceWidth)).toBeLessThan(1);
    expect(Math.abs(layout.homeWidth - layout.contentWidth)).toBeLessThan(1);
    expect(Math.abs(layout.heroWidth - layout.homeWidth)).toBeLessThan(1);
    expect(Math.abs(layout.featuredWidth - layout.homeWidth)).toBeLessThan(1);
    expect(layout.statusWidths).toHaveLength(3);
    expect(
      Math.max(...layout.statusWidths) - Math.min(...layout.statusWidths),
    ).toBeLessThan(1);
    if (width >= 1024) {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      expect(
        Math.abs(
          await page
            .locator(".app-sidebar")
            .evaluate((element) => element.getBoundingClientRect().top),
        ),
      ).toBeLessThan(1);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
});

test("an empty Home has one clear creation action and no invented trip data", async ({
  page,
}) => {
  await renderHome(page, "empty");
  const home = page.locator(".home-hq");
  await expect(home.getByRole("link", { name: "Create a trip" })).toHaveCount(
    1,
  );
  await expect(home.getByRole("link", { name: /Open trip/ })).toHaveCount(0);
  await expect(
    home.getByRole("region", { name: "Trip essentials" }),
  ).toHaveCount(0);
});
