import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect } from "@playwright/test";
import { TripNavigationView } from "../../components/trip-navigation-view";
// Render the real navigation with synthetic IDs in isolation. This exercises
// the production stylesheet without simulating an authenticated app session.
test("trip navigation fits the viewport and keeps all sections reachable", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  const markup = renderToStaticMarkup(
    <TripNavigationView
      tripId="fixture-trip"
      view="itinerary"
      day="2027-05-03"
      owner
    />,
  );
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles
        .map((url) => '<link rel="stylesheet" href="' + url + '">')
        .join("") +
      "</head><body><main>" +
      markup +
      "</main></body></html>",
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".trip-nav-primary")!).display !==
      "block",
  );
  const mobile = page.viewportSize()!.width <= 700;
  if (mobile) {
    await expect(page.getByLabel("More trip sections")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Days", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".trip-nav-secondary")).toBeHidden();
  } else {
    await expect(page.getByLabel("More trip sections")).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Itinerary", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Budget", exact: true }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/trips/fixture-trip?view=itinerary&day=2027-05-03",
  );
});
