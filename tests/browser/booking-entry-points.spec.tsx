import { test, expect } from "@playwright/test";
import { tripOverview } from "../../lib/trip-overview";
import { tripMapData } from "../../lib/trip-map";
import { overviewTrip, overviewBooking } from "../fixtures/trip-overview";
import { build } from "vite";
import { resolve, dirname } from "node:path";
let bundle = "";
test.beforeAll(async () => {
  const replaced = [
    "lib/access",
    "app/trip-map-actions",
    "lib/booking-collection-server",
    "app/booking-budget-actions",
    "components/budget-planning-tools",
    "components/essentials/attachment-form",
  ].map((p) => resolve(p));
  const runtime = resolve("tests/fixtures/booking-entry-runtime.tsx");
  const result = await build({
    configFile: false,
    logLevel: "error",
    plugins: [
      {
        name: "isolated-production-booking-composition",
        enforce: "pre",
        load(id) {
          if (id === "\0fixture:dynamic-map")
            return "export default function dynamic(){return function Canvas(){return null}}";
          if (id === "\0fixture:map-canvas")
            return "export default function Canvas(){return null}";
        },
        resolveId(source, importer) {
          if (source === "next/dynamic") return "\0fixture:dynamic-map";
          if (
            importer &&
            source.startsWith(".") &&
            resolve(dirname(importer), source).replace(/\.[jt]sx?$/, "") ===
              resolve("components/trip-map-canvas")
          )
            return "\0fixture:map-canvas";
          if (source === "next/link" || source === "next/navigation")
            return runtime;
          if (
            importer &&
            source.startsWith(".") &&
            replaced.includes(
              resolve(dirname(importer), source).replace(/\.[jt]sx?$/, ""),
            )
          )
            return runtime;
        },
      },
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.AI_MODE": JSON.stringify("off"),
      "process.env.AI_API_KEY": JSON.stringify(""),
      __PFEW_MAP__: JSON.stringify(
        tripMapData(
          overviewTrip,
          [],
          [overviewBooking({ title: "Map stay fixture" })],
          [],
        ),
      ),
      __PFEW_OVERVIEW__: JSON.stringify(
        tripOverview(
          overviewTrip,
          [],
          {
            bookings: [],
            tasks: [],
            packingLists: [],
            packingItems: [],
            documents: [],
            allocations: [],
            expenses: [],
            includePrepaid: true,
            findings: [],
            decisions: [],
          },
          new Date("2027-04-01T12:00:00Z"),
        ),
      ),
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/booking-entry-browser.tsx"),
        formats: ["iife"],
        name: "ProductionBookingEntryFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
test("existing trip owner clicks manual booking in the production page composition, saves and reopens Stay", async ({
  page,
}, info) => {
  page.on("pageerror", (e) => console.log("Fixture page error:", e.message));
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
  await page.setContent(
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page
    .getByRole("button", { name: "Open existing trip", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Trip overview sections" })
    .getByRole("link", { name: "Bookings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your bookings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: "Stay", exact: true }).check();
  await drawer
    .getByLabel("Where are you staying?", { exact: true })
    .fill("Our unlisted cottage");
  await expect(
    drawer.getByLabel("Where are you staying?", { exact: true }),
  ).toHaveCount(1);
  await expect(
    drawer.getByLabel("Currency", { exact: true }).locator("option"),
  ).toHaveText(["EUR (€)", "USD ($)", "RON (lei)"]);
  for (const name of ["Paid", "Pay later", "Not set"])
    await expect(
      drawer.getByRole("radio", { name, exact: true }),
    ).toBeVisible();
  await drawer.getByLabel("Check-in date").fill("2027-05-02");
  await drawer.getByLabel("Check-out date").fill("2027-05-04");
  await drawer.getByLabel("Currency", { exact: true }).selectOption("RON");
  await drawer.getByLabel("Cost (optional)").fill("100");
  await drawer.getByRole("radio", { name: "Pay later", exact: true }).check();
  await drawer
    .getByRole("radio", { name: "Payment due on a specific date", exact: true })
    .check();
  await expect(drawer.getByLabel("Payment due", { exact: true })).toBeVisible();
  await drawer.getByLabel("Payment due", { exact: true }).fill("2027-04-15");
  await drawer
    .getByLabel("Where are you staying?", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `tests/screenshots/booking-entry-points/${info.project.name}/existing-trip-manual-stay.png`,
  });
  await drawer.getByLabel("Currency", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `tests/screenshots/booking-entry-points/${info.project.name}/existing-trip-manual-payment.png`,
  });
  await drawer
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  await page
    .getByRole("button", { name: "Our unlisted cottage", exact: true })
    .click();
  await expect(
    drawer.getByLabel("Where are you staying?", { exact: true }),
  ).toHaveValue("Our unlisted cottage");
  await expect(drawer.getByLabel("Currency", { exact: true })).toHaveValue(
    "RON",
  );
  await expect(drawer.getByLabel("Payment due", { exact: true })).toHaveValue(
    "2027-04-15",
  );
  const localRoute = await page.evaluate(
    () => location.pathname + location.search,
  );
  await page.goto("/login");
  await page.evaluate(
    (route) => history.replaceState({}, "", route),
    localRoute,
  ); // Remount using the same local session records.
  await page.setContent(
    "<html><head>" +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page
    .getByRole("button", { name: "Our unlisted cottage", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Currency", { exact: true }),
  ).toHaveValue("RON");
});

test("Create Trip, shared Editor and Stays manual actions render the same canonical controls", async ({
  page,
}) => {
  for (const [view, extra] of [
    ["create", ""],
    ["bookings", "&fixture-editor"],
    ["stays", ""],
  ]) {
    await page.goto("/login");
    const styles = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
    await page.evaluate((url) => {
      sessionStorage.clear();
      history.replaceState({}, "", url);
    }, `/trips/${overviewTrip.id}?view=${view}${extra}`);
    await page.setContent(
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
        styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
        '</head><body><div id="fixture-root"></div></body></html>',
    );
    await page.addScriptTag({ content: bundle });
    await page
      .getByRole("button", { name: "Add manually", exact: true })
      .click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("radio", { name: "Stay", exact: true }).check();
    await drawer
      .getByLabel("Where are you staying?", { exact: true })
      .fill(`Stay from ${view}`);
    await expect(
      drawer.getByLabel("Currency", { exact: true }).locator("option"),
    ).toHaveText(["EUR (€)", "USD ($)", "RON (lei)"]);
    await drawer.getByLabel("Check-in date").fill("2027-05-02");
    await drawer.getByLabel("Check-out date").fill("2027-05-04");
    await drawer.getByRole("radio", { name: "Pay later", exact: true }).check();
    await drawer
      .getByRole("radio", { name: "Pay at the property", exact: true })
      .check();
    await expect(drawer.getByLabel("Payment due", { exact: true })).toHaveCount(
      0,
    );
    await drawer
      .getByRole("button", { name: "Save booking", exact: true })
      .click();
    await expect(drawer).toHaveCount(0);
    await page
      .getByRole("button", { name: `Stay from ${view}`, exact: true })
      .click();
    await expect(
      drawer.getByRole("radio", { name: "Pay at the property", exact: true }),
    ).toBeChecked();
    await expect(
      drawer.getByLabel("Where are you staying?", { exact: true }),
    ).toHaveValue(`Stay from ${view}`);
  }
});

test("Itinerary booking management links open the same existing-trip manual form", async ({
  page,
}) => {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
  await page.evaluate(
    (url) => history.replaceState({}, "", url),
    `/trips/${overviewTrip.id}?view=itinerary`,
  );
  await page.setContent(
    "<html><head>" +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page
    .getByRole("link", { name: "Manage bookings →", exact: true })
    .click();
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: "Stay", exact: true }).check();
  await expect(
    drawer.getByLabel("Where are you staying?", { exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByLabel("Currency", { exact: true }).locator("option"),
  ).toHaveCount(3);
});

test("expanded map booking link opens the canonical saved-booking editor", async ({
  page,
}, info) => {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
  await page.evaluate(
    (url) => history.replaceState({}, "", url),
    `/trips/${overviewTrip.id}?view=map`,
  );
  await page.setContent(
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /Destinations & places/ }).click();
  await page.getByRole("link", { name: "View booking", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByLabel("Where are you staying?", { exact: true }),
  ).toHaveValue("Map stay fixture");
  await expect(
    drawer.getByLabel("Currency", { exact: true }).locator("option"),
  ).toHaveCount(3);
});

test("generic Name finds Casa Vimaya directly and saves its selected location without Location details", async ({
  page,
}, info) => {
  const { geographicLocation } = await import("../../lib/geographic-location");
  const place = geographicLocation(
    "Casa Vimaya Riverside Hotel",
    "Bangkok, Thailand",
    13.7615949,
    100.4993903,
    "TH",
    "osm:N:1000123",
  );
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({
      json: {
        results: [place],
        presentations: {
          [place.id]: {
            context: "Bangkok, Thailand",
            type: "Hotel",
            address: "Phra Sumen Road, Bangkok, Thailand",
          },
        },
        status: "ok",
        worldwideAvailable: true,
      },
    }),
  );
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
  await page.evaluate(
    (url) => history.replaceState({}, "", url),
    `/trips/${overviewTrip.id}?view=bookings`,
  );
  await page.setContent(
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  const drawer = page.getByRole("dialog"),
    name = drawer.getByRole("combobox", { name: "Name", exact: true });
  await name.fill("Casa Vimaya");
  await expect(
    drawer.getByRole("option", { name: /Casa Vimaya Riverside Hotel/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `tests/screenshots/booking-entry-points/${info.project.name}/name-casa-suggestions.png`,
  });
  await name.press("ArrowDown");
  await name.press("Enter");
  await expect(name).toHaveValue("Casa Vimaya Riverside Hotel");
  await expect(
    drawer.getByText("Location details (optional)", { exact: true }),
  ).toHaveCount(0);
  await expect(
    drawer.getByLabel("Address (optional)", { exact: true }),
  ).toHaveCount(0);
  await drawer.getByLabel("Date", { exact: true }).fill("2027-05-02");
  await drawer
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  await page
    .getByRole("button", { name: "Casa Vimaya Riverside Hotel", exact: true })
    .click();
  await expect(name).toHaveValue("Casa Vimaya Riverside Hotel");
  const saved = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("fixture:canonical-booking-entry")!)[0],
  );
  expect(saved.location_id).toBe(place.id);
  expect(saved.latitude).toBe(place.latitude);
  expect(saved.destination).toBe("Phra Sumen Road, Bangkok, Thailand");
});
