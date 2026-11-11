import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect, type Page } from "@playwright/test";
import { AppShellView } from "../../components/app-shell-view";
import { TripNavigationView } from "../../components/trip-navigation-view";
import type { TripCard } from "../../lib/trip-collection";

const trip: TripCard = {
  id: "fixture-trip",
  name: "A little escape across the islands",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  shared: false,
  lifecycle: "upcoming",
};

// Exercise the real shell and production CSS with explicit test data. This does
// not create a production mock route or pretend to establish a Google session.
async function renderShell(
  page: Page,
  options: { shared?: boolean; empty?: boolean } = {},
) {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  const active = options.empty
    ? null
    : { ...trip, shared: Boolean(options.shared) };
  const markup = renderToStaticMarkup(
    <AppShellView
      trips={active ? [active] : []}
      activeTrip={active}
      pathname="/trips/fixture-trip"
      view="itinerary"
      day="2027-05-03"
      accountMenu={
        <button className="account-trigger" aria-label="Open account menu">
          AT
        </button>
      }
    >
      <h1>Your saved plans</h1>
      {active && (
        <TripNavigationView
          tripId={trip.id}
          view="itinerary"
          day="2027-05-03"
          owner={!active.shared}
        />
      )}
      <section className="card">
        <h2>A little room for adventure</h2>
        <p>Your existing trip content stays here.</p>
      </section>
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
  await expect(page.locator(".app-shell")).toHaveCSS(
    "background-color",
    "rgb(246, 246, 248)",
  );
  await page.evaluate(() => document.fonts.ready);
}

test("responsive shell keeps the approved navigation and every trip tool reachable", async ({
  page,
}) => {
  test.setTimeout(60000);
  await renderShell(page);
  const mobile = page.viewportSize()!.width < 1024;
  const sidebar = page.getByRole("complementary", { name: "Travel workspace" });
  if (mobile) {
    await expect(sidebar).toBeHidden();
    const nav = page.getByRole("navigation", {
      name: "Mobile navigation",
      exact: true,
    });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveText([
      "Home",
      "Trips",
      "Itinerary",
      "Bookings",
    ]);
    const more = nav.locator("summary");
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(nav.locator("details")).toHaveAttribute("open", "");
    for (const name of [
      "Packing",
      "Documents",
      "Budget",
      "Prep",
      "Map",
      "Research",
      "People",
      "Offline",
    ])
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Trip settings", exact: true }),
    ).toBeVisible();
  } else {
    await expect(sidebar).toBeVisible();
    const nav = sidebar.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    await expect(nav.getByRole("link")).toHaveText([
      "Home",
      "My Trips",
      "Itinerary",
      "Bookings",
      "Packing",
      "Documents",
    ]);
    await expect(
      nav.getByRole("link", { name: "Itinerary", exact: true }),
    ).toHaveCSS("background-color", "rgb(224, 245, 123)");
    await expect(
      nav.getByRole("link", { name: "Itinerary", exact: true }),
    ).toHaveCSS("color", "rgb(34, 37, 43)");
    await expect(nav.getByRole("link", { name: "Budget" })).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "More trip tools" })
        .getByRole("link", { name: "Budget" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation", exact: true }),
    ).toBeHidden();
  }
  await expect(
    page.getByRole("combobox", { name: "Current trip" }),
  ).toHaveValue(trip.id);
  const itinerary = page
    .getByRole("link", { name: "Itinerary", exact: true })
    .filter({ visible: true });
  await expect(itinerary).toHaveAttribute(
    "href",
    "/trips/fixture-trip?view=itinerary&day=2027-05-03",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("navigation-shell.png"),
    fullPage: true,
  });
});

test("shell fits small phones, tablets, and the desktop breakpoint", async ({
  page,
}) => {
  test.setTimeout(60000);
  await renderShell(page);
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width < 1024) {
      await expect(page.locator(".app-mobile-nav")).toBeVisible();
      await expect(page.locator(".app-sidebar")).toBeHidden();
    } else {
      await expect(page.locator(".app-sidebar")).toBeVisible();
      await expect(page.locator(".app-mobile-nav")).toBeHidden();
    }
  }
});

test("shared and empty contexts do not expose owner settings or unusable trip links", async ({
  page,
}) => {
  test.setTimeout(60000);
  await renderShell(page, { shared: true });
  if (page.viewportSize()!.width < 1024)
    await page.locator(".app-more > summary").click();
  await expect(
    page.getByRole("link", { name: "Trip settings", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "More trip tools" })
      .getByRole("link", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await renderShell(page, { empty: true });
  await expect(
    page.getByRole("combobox", { name: "Current trip" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Itinerary", exact: true }),
  ).toHaveCount(0);
});
