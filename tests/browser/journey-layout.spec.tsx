import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect } from "@playwright/test";
import {
  JourneyHeader,
  JourneyOverviewView,
} from "../../components/pfew/journey-view";
import { PfewContextMenu } from "../../components/pfew/context-menu";
import { TripNavigationView } from "../../components/trip-navigation-view";
import { journeyTrip, journeySegments } from "../journey-fixtures";
import { buildJourney } from "../../lib/journey";
const PreviewLink = "a";
// Isolated real presentation with illustrative data, never an auth bypass/demo route.
test("Journey Overview has distinct destination/connection hierarchy without horizontal overflow", async ({
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
    <div className="pfew-journey-screen">
      <p className="design-review-label">
        Design review · illustrative trip data
      </p>
      <PreviewLink href="/" className="muted">
        ← All your trips
      </PreviewLink>
      <JourneyHeader trip={journeyTrip} canEdit />
      <TripNavigationView
        tripId={journeyTrip.id}
        view="destinations"
        day={journeyTrip.start_date}
        owner
      />
      <JourneyOverviewView
        trip={journeyTrip}
        journey={buildJourney(journeyTrip, journeySegments, [])}
        canEdit
        insight={{ checkedAt: null, visibleCount: 0, title: null }}
        renderMenu={(segment) => (
          <PfewContextMenu
            tripId={journeyTrip.id}
            itemId={segment.id}
            title={segment.title}
            deleteAction={async () => {}}
          />
        )}
      />
    </div>,
  );
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles
        .map((url) => '<link rel="stylesheet" href="' + url + '">')
        .join("") +
      '<style>.design-review-label{font-size:10px;color:#62626a;margin:0 0 20px}</style></head><body><header><a class="logo" href="/">pfew<span>.</span></a><span style="margin-left:auto;font-size:12px;font-weight:700">Journey Overview</span></header><main>' +
      markup +
      "</main></body></html>",
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".pfew-destination")!)
        .borderRadius !== "0px",
  );
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".pfew-destination")).toHaveCount(3);
  await expect(page.locator(".pfew-connection")).toHaveCount(2);
  expect(
    await page
      .locator(".pfew-destination")
      .evaluateAll((cards) =>
        cards.map((card) => getComputedStyle(card).backgroundColor),
      ),
  ).toEqual(["rgb(217, 180, 239)", "rgb(224, 245, 123)", "rgb(240, 199, 233)"]);
  await expect(
    page.getByRole("heading", { name: "Tokyo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("12–16 Sept 2027")).toBeVisible();
  expect(
    await page.locator(".pfew-destination").first().innerText(),
  ).not.toMatch(/2027-09-12/);
  expect(
    await page
      .getByRole("button", { name: "Options for Tokyo" })
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(44);
  if (page.viewportSize()!.width > 760) {
    const story = await page.locator(".pfew-journey-story").boundingBox(),
      aside = await page.locator(".pfew-journey-aside").boundingBox();
    expect(aside!.x).toBeGreaterThan(story!.x + story!.width);
  }
  await page.screenshot({
    path: `test-results/journey-${test.info().project.name}.png`,
    fullPage: true,
  });
});
