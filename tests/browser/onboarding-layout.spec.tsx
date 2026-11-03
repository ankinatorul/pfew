import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import type { OnboardingInput } from "../../lib/onboarding";
let script = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents:
        'import React from "react";import {createRoot} from "react-dom/client";import {TripOnboarding} from "./components/onboarding/onboarding";createRoot(document.getElementById("fixture")).render(<TripOnboarding live />);',
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
    jsx: "automatic",
  });
  script = result.outputFiles[0].text;
});
async function mount(page: Page) {
  await page.goto("/login");
  const header = await page
    .locator("body > header")
    .evaluate((node) => node.outerHTML);
  const footer = await page
    .locator("body > footer")
    .evaluate((node) => node.outerHTML);
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles
        .map((href) => '<link rel="stylesheet" href="' + href + '">')
        .join("") +
      "</head><body>" +
      header +
      '<main><p style="font:10px Arial;color:#666;margin:0 0 12px">Browser test · illustrative data</p><div id="fixture"></div></main>' +
      footer +
      "</body></html>",
  );
  await page.addScriptTag({ content: script });
  await page
    .getByRole("heading", { name: "Let’s start with your trip." })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page: Page, name: string, project: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("body > header")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "My trips", exact: true }),
  ).toBeVisible();
  const surface = await page.locator(".pfew-onboarding").evaluate((node) => {
    const styles = getComputedStyle(node);
    return {
      border: styles.borderTopWidth,
      radius: styles.borderTopLeftRadius,
    };
  });
  expect(surface).toEqual({ border: "0px", radius: "0px" });
  await expect(page.locator(".onboarding-panel")).toHaveCSS(
    "border-radius",
    "0px",
  );
  const viewport = page.viewportSize()!;
  const panel = await page.locator(".onboarding-panel").boundingBox();
  if (viewport.width >= 1024) {
    await expect(
      page.getByRole("complementary", { name: "Trip setup overview" }),
    ).toBeVisible();
    expect(panel!.width).toBeGreaterThan(700);
    if (name === "01-basics") {
      const action = await page
        .getByRole("button", { name: "Continue", exact: true })
        .boundingBox();
      expect(action!.y + action!.height).toBeLessThanOrEqual(viewport.height);
    }
    const rail = await page.locator(".onboarding-rail").boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(rail!.x + rail!.width - 1);
  } else {
    await expect(page.locator(".onboarding-rail")).toBeHidden();
    expect(panel!.width).toBeGreaterThan(
      viewport.width <= 480 ? viewport.width - 45 : 650,
    );
  }
  await page.screenshot({
    path: `test-results/onboarding-${name}-${project}.png`,
    fullPage: true,
  });
}
test("website onboarding preserves its shell and allows a flight-only result", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await mount(page);
  await page.getByLabel("Trip name").fill("Summer in Japan");
  await page.getByLabel("Departure", { exact: true }).fill("2027-06-12");
  await page.getByLabel("Return", { exact: true }).fill("2027-06-26");
  await capture(page, "01-basics", info.project.name);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await capture(page, "02-bookings", info.project.name);
  await page.route("**/api/onboarding/extract", (route) =>
    route.fulfill({
      json: {
        importKey: randomUUID(),
        method: "ai",
        evidence: {},
        warnings: [],
        fields: {
          title: "Bucharest → Tokyo",
          category: "flight",
          provider: null,
          reference: null,
          start_date: "2027-06-12",
          end_date: "2027-06-12",
          local_time: null,
          end_local_time: null,
          origin: "Bucharest",
          destination: "Tokyo",
          price: null,
          paid_amount: null,
          currency: "EUR",
        },
      },
    }),
  );
  let saved: OnboardingInput | undefined;
  await page.route("**/api/onboarding/create", async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({
      json: {
        trip: {
          id: "fixture-trip",
          name: "Summer in Japan",
          start_date: "2027-06-12",
          end_date: "2027-06-26",
        },
        href: "/trips/fixture-trip?view=destinations",
      },
    });
  });
  await page.getByLabel("Booking PDFs or screenshots").setInputFiles({
    name: "flight.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("illustrative file; endpoint mocked"),
  });
  await page.getByLabel(/Send these documents/).check();
  await page.getByRole("button", { name: "Read selected bookings" }).click();
  await expect(page.getByText("Read · review required")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await capture(page, "03-review", info.project.name);
  await expect(
    page.getByLabel("I confirm this reservation exists."),
  ).not.toBeChecked();
  await page.getByText("Review required", { exact: true }).click();
  await page.getByLabel(/I reviewed these details/).check();
  await page.getByRole("button", { name: "Confirm details" }).click();
  await capture(page, "04-personalize", info.project.name);
  await expect(page.getByRole("radio", { name: "Balanced" })).toBeChecked();
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({
    width: originalViewport.width >= 1024 ? 375 : 1440,
    height: 900,
  });
  await expect(
    page.getByRole("heading", { name: "Make it your kind of trip." }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Balanced" })).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize(originalViewport);

  await page.getByRole("button", { name: "Create my trip" }).click();
  await page.getByRole("heading", { name: "A great start." }).waitFor();
  await capture(page, "03a-flight-only", info.project.name);
  expect(saved?.bookings[0].confirmed).toBe(false);
  expect(saved?.pace).toBe("Flexible");
  await expect(
    page.getByRole("link", { name: /Smart Trip Check/ }),
  ).toHaveAttribute("href", "/trips/fixture-trip?view=check");
  await expect(
    page.getByText("Not added yet — that’s completely fine."),
  ).toBeVisible();
});
test("manual no-booking trip reaches its real workspace handoff", async ({
  page,
}, info) => {
  test.setTimeout(45000);
  await mount(page);
  await page.getByLabel("Trip name").fill("A little escape");
  await page.getByLabel("Departure", { exact: true }).fill("2027-06-12");
  await page.getByLabel("Return", { exact: true }).fill("2027-06-26");
  await page.route("**/api/onboarding/create", (route) =>
    route.fulfill({
      json: {
        trip: {
          id: "fixture-trip",
          name: "A little escape",
          start_date: "2027-06-12",
          end_date: "2027-06-26",
        },
        href: "/trips/fixture-trip?view=destinations",
      },
    }),
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm details" }).click();
  await page.getByRole("button", { name: "Create my trip" }).click();
  await page.getByRole("heading", { name: "Your trip, organized." }).waitFor();
  await capture(page, "05-workspace", info.project.name);
  await expect(
    page.getByRole("link", { name: /Continue with my trip/ }),
  ).toHaveAttribute("href", "/trips/fixture-trip?view=destinations");
});
