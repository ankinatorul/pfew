import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import {
  overviewTrip as trip,
  overviewData,
  overviewNow,
} from "../fixtures/trip-overview";
import { tripOverview } from "../../lib/trip-overview";

let bundle: string;
test.beforeAll(async () => {
  // No test routes or data enter the application. Bundle the actual components
  // with Next routing/server actions and the account display stubbed locally.
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env": "{}",
      __TRIP_OVERVIEW_FIXTURE__: JSON.stringify(
        tripOverview(trip, [], overviewData(), overviewNow, "2027-05-03"),
      ),
    },
    plugins: [
      {
        name: "isolated-trip-management",
        enforce: "pre",
        resolveId(source) {
          if (source.endsWith("/app/actions")) return "\0fixture-actions";
          if (source === "next/link") return "\0fixture-link";
          if (source === "next/navigation") return "\0fixture-navigation";
          if (source === "./account-menu") return "\0fixture-account";
        },
        load(id) {
          if (id === "\0fixture-account")
            return `import React from 'react'; export function AccountMenu() { return React.createElement('div', {className:'header-account'}, React.createElement('button', {className:'account-trigger'}, 'FT')); }`;
          if (id === "\0fixture-actions")
            return `
          export const saveTrip = form => window.tripManagementFixture.save(form);
          export const deleteTrip = form => window.tripManagementFixture.remove(form);
          export const saveSegment = () => { throw new Error('Unexpected segment write'); };
          export const deleteSegment = () => { throw new Error('Unexpected segment deletion'); };`;
          if (id === "\0fixture-link")
            return `import React from 'react';
          export default function Link({href, children, ...props}) {
            return React.createElement('a', {...props, href, onClick(e) { if(!e.ctrlKey && !e.metaKey) { e.preventDefault(); window.tripManagementFixture.navigate(href); } }}, children);
          }`;
          if (id === "\0fixture-navigation")
            return `
          export const usePathname = () => window.location.pathname;
          export const useSearchParams = () => new URLSearchParams(window.location.search);
          const router = { push: href => window.tripManagementFixture.navigate(href), replace: href => window.tripManagementFixture.navigate(href) };
          export const useRouter = () => router;
          export const unstable_rethrow = error => { if(error?.digest?.startsWith('NEXT_REDIRECT')) throw error; };`;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/trip-management-browser.tsx"),
        formats: ["iife"],
        name: "TripManagementFixture",
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  bundle = outputs
    .flatMap((output) => ("output" in output ? output.output : []))
    .filter((output) => output.type === "chunk")
    .map((output) => output.code)
    .join("\n");
  expect(bundle.length).toBeGreaterThan(0);
});

async function mount(page: Page) {
  page.on("pageerror", (error) =>
    console.error("Fixture browser error:", error.stack),
  );
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((url) => `<link rel="stylesheet" href="${url}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.evaluate(
    (id) => history.replaceState(null, "", "/trips/" + id),
    trip.id,
  );
  await page.addScriptTag({ content: bundle });
  await expect(page.getByRole("link", { name: "Edit trip" })).toBeVisible();
  await page.getByRole("link", { name: "Edit trip" }).click();
  await expect(page.getByRole("heading", { name: "Edit trip" })).toBeVisible();
}

test("Edit trip reuses the saved form on a full-width desktop/mobile canvas", async ({
  page,
}) => {
  await mount(page);
  await expect(page).toHaveURL(
    new RegExp(`trips/${trip.id}\\?view=settings&day=2027-05-03`),
  );
  await expect(page.getByLabel("Trip name · optional")).toHaveValue(trip.name);
  await expect(page.getByRole("button", { name: /Trip actions/ })).toHaveCount(
    0,
  );
  for (const width of [320, 375, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>(".app-main")!;
        return (
          document.documentElement.scrollWidth <= innerWidth &&
          Math.abs(
            main.getBoundingClientRect().width -
              document.querySelector(".app-workspace")!.getBoundingClientRect()
                .width,
          ) < 1
        );
      }),
    ).toBe(true);
  }
  await page.setViewportSize(test.info().project.use.viewport!);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: test.info().outputPath("edit-trip.png"),
    fullPage: true,
  });
  await page.getByLabel("Return", { exact: true }).fill("2027-04-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("End date");
  await page.getByLabel("Return", { exact: true }).fill(trip.end_date);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: trip.name })).toBeVisible();
  expect(await page.evaluate(() => window.tripManagementFixture.calls)).toEqual(
    [{ action: "save", id: trip.id, name: trip.name }],
  );
});

test("deletion cancellation and guarded failure preserve the isolated trip and show feedback", async ({
  page,
}) => {
  await mount(page);
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("sharing access for everyone");
    expect(dialog.message()).toContain("does not cancel reservations");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("unchanged");
  expect(await page.evaluate(() => window.tripManagementFixture.calls)).toEqual(
    [],
  );
  await page.evaluate(() => {
    window.tripManagementFixture.failure = true;
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your trip is still saved",
  );
  await expect(page.getByLabel("Trip name · optional")).toHaveValue(trip.name);
  expect(await page.evaluate(() => window.tripManagementFixture.deleted)).toBe(
    false,
  );
});

test("confirmed fixture deletion opens My Trips and reconciles the active-trip selection", async ({
  page,
}) => {
  await mount(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Trips" })).toBeVisible();
  await expect(page).toHaveURL(/\/trips$/);
  expect(await page.evaluate(() => window.tripManagementFixture.calls)).toEqual(
    [{ action: "delete", id: trip.id }],
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("pfew:active-trip:browser-fixture-owner"),
    ),
  ).toBe("88888888-8888-4888-8888-888888888888");
  await expect(page.locator(".app-trip-select").first()).toHaveValue(
    "88888888-8888-4888-8888-888888888888",
  );
});

test("deleting the last fixture clears only its active-trip preference", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    window.tripManagementFixture.lastTrip = true;
    localStorage.setItem("unrelated-fixture-data", "keep");
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Trips" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("pfew:active-trip:browser-fixture-owner"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-fixture-data")),
  ).toBe("keep");
});
