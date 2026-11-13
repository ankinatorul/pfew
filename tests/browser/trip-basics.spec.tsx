import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import { geographicLocation } from "../../lib/geographic-location";
let bundle: string;
const choices = [
  geographicLocation("Kyoto", "Japan", 35.01, 135.77, "JP", "osm:R:357238"),
  geographicLocation("São Tomé", "São Tomé and Príncipe", 0.33, 6.73, "ST"),
];
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/trip-basics-browser.tsx"),
        formats: ["iife"],
        name: "TripBasicsFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((result) => ("output" in result ? result.output : []))
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
});
async function mount(page: Page, query = "") {
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({ json: { results: choices, worldwideAvailable: true } }),
  );
  await page.goto("/login" + query);
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  await page.setContent(
    '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((url) => `<link rel="stylesheet" href="${url}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
}
async function choose(page: Page, number: number, index = 0) {
  const input = page.getByRole("combobox", {
    name:
      number === 1 &&
      (await page
        .getByRole("combobox", { name: "Destination", exact: true })
        .count())
        ? "Destination"
        : `Destination ${number}`,
    exact: true,
  });
  await input.fill(index ? "São" : "Kyoto");
  await page
    .getByRole("option", { name: choices[index].label, exact: true })
    .click();
}
test("validates basics, preserves ordered worldwide destinations, requires both dates and resumes without duplication", async ({
  page,
}, testInfo) => {
  await mount(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Choose a destination");
  await choose(page, 1);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Give your trip a name");
  await page
    .getByRole("textbox", { name: /Trip name/ })
    .fill("Island & city possibilities");
  await page
    .getByRole("button", { name: "Add destination", exact: true })
    .click();
  await choose(page, 2, 1);
  await page.getByRole("button", { name: "Move destination 2 up" }).click();
  await expect(
    page.getByRole("combobox", { name: "Destination 1", exact: true }),
  ).toHaveValue(choices[1].label);
  await page.locator('[name="start_date"]').fill("2027-06-08");
  await page.locator('[name="end_date"]').fill("2027-06-01");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Return date must be on or after departure",
  );
  await page.locator('[name="start_date"]').fill("");
  await page.locator('[name="end_date"]').fill("");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("departure date");
  await page.locator('[name="start_date"]').fill("2027-06-01");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("return date");
  await page.locator('[name="start_date"]').fill("");
  await page.locator('[name="end_date"]').fill("2027-06-01");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("departure date");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("fixture:private-trip-drafts"),
    ),
  ).toBeNull();
  await expect(page.locator('[name="start_date"]')).toHaveAttribute(
    "required",
    "",
  );
  await expect(page.locator('[name="end_date"]')).toHaveAttribute(
    "required",
    "",
  );
  await expect(page.getByText(/Still figuring out when/)).toHaveCount(0);
  await page.locator('[name="start_date"]').fill("2027-06-01");
  await page.locator('[name="end_date"]').fill("2027-06-10");
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(testInfo.project.use.viewport!);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: testInfo.outputPath("trip-basics.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your basics are safely saved." }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fixture:private-trip-drafts") || "[]"),
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].start_date).toBe("2027-06-01");
  expect(saved[0].end_date).toBe("2027-06-10");
  expect(
    saved[0].draft_data.destinations.map((row: { id: string }) => row.id),
  ).toEqual([choices[1].id, choices[0].id]);
  await page.getByRole("button", { name: "Edit trip basics" }).click();
  await expect(
    page.getByRole("combobox", { name: "Destination 1", exact: true }),
  ).toHaveValue(choices[1].label);
  await page.locator('[name="end_date"]').fill("2027-06-30");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your basics are safely saved." }),
  ).toBeVisible();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fixture:private-trip-drafts") || "[]"),
  );
  expect(after).toHaveLength(1);
  expect(after[0].id).toBe(saved[0].id);
  expect(after[0].start_date).toBe("2027-06-01");
  expect(after[0].end_date).toBe("2027-06-30");
  await mount(page, "?choices=1");
  await expect(
    page.getByRole("heading", { name: "Pick up where you left off?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Resume Island & city possibilities" }),
  ).toHaveAttribute("href", `/trips/new?draft=${saved[0].id}`);
  await mount(page, `?draft=${saved[0].id}&step=1`);
  await expect(page.getByRole("textbox", { name: /Trip name/ })).toHaveValue(
    "Island & city possibilities",
  );
  await expect(page.locator('[name="end_date"]')).toHaveValue("2027-06-30");
});
test("retains incomplete local input through reload, reports save failures, and starts an independent draft", async ({
  page,
}) => {
  await mount(page, "?fail=1");
  await page
    .getByRole("textbox", { name: /Trip name/ })
    .fill("My first possibility");
  await choose(page, 1);
  await mount(page, "?fail=1");
  await expect(page.getByRole("textbox", { name: /Trip name/ })).toHaveValue(
    "My first possibility",
  );
  await expect(
    page.getByRole("combobox", { name: "Destination", exact: true }),
  ).toHaveValue(choices[0].label);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("departure date");
  await page.locator('[name="start_date"]').fill("2027-06-01");
  await page.locator('[name="end_date"]').fill("2027-06-10");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await expect(page.getByRole("textbox", { name: /Trip name/ })).toHaveValue(
    "My first possibility",
  );
  await mount(page, "?choices=1");
  await expect(
    page.getByRole("link", { name: "Resume My first possibility" }),
  ).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Start a new trip" })
    .getAttribute("href");
  await mount(page, "?" + href!.split("?")[1]);
  await expect(page.getByRole("textbox", { name: /Trip name/ })).toHaveValue(
    "",
  );
  await page
    .getByRole("textbox", { name: /Trip name/ })
    .fill("Another independent trip");
  await choose(page, 1, 1);
  await page.locator('[name="start_date"]').fill("2027-07-01");
  await page.locator('[name="end_date"]').fill("2027-07-01");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your basics are safely saved." }),
  ).toBeVisible();
  await mount(page, "?choices=1");
  await expect(
    page.getByRole("link", { name: "Resume My first possibility" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Resume Another independent trip" }),
  ).toBeVisible();
});

const curatedChoices = [
  { name: "Ko Lanta", type: "Island", lat: 8.1, lon: 98.95, id: 100 },
  { name: "Ko Lanta", type: "District", lat: 8.15, lon: 98.96, id: 101 },
  { name: "Ko Lanta Noi", type: "Island", lat: 8.12, lon: 99.02, id: 102 },
  { name: "Saladan", type: "Village", lat: 7.65, lon: 99.04, id: 103 },
  { name: "Klong Dao", type: "Beach", lat: 7.64, lon: 99.03, id: 104 },
  { name: "Ko Lanta Yai", type: "Island", lat: 7.56, lon: 99.06, id: 105 },
  { name: "Ko Lanta", type: "Island", lat: 8.101, lon: 98.951, id: 106 },
].map((p) => ({
  location: geographicLocation(
    p.name,
    "Krabi, Thailand",
    p.lat,
    p.lon,
    "TH",
    `osm:R:${p.id}`,
  ),
  type: p.type,
}));
function curatedReply() {
  return {
    results: curatedChoices.map((c) => c.location),
    presentations: Object.fromEntries(
      curatedChoices.map((c) => [
        c.location.id,
        { context: "Krabi, Thailand", type: c.type },
      ]),
    ),
    worldwideAvailable: true,
    status: "ok",
  };
}
async function searchCapture(page: Page, name: string, project: string) {
  await page.screenshot({
    path: resolve(
      "tests/screenshots/destination-search-correction",
      project,
      name + ".png",
    ),
    fullPage: true,
  });
}
test("curated destinations show five clean choices, expand without another request and preserve ordered draft IDs", async ({
  page,
}, info) => {
  await mount(page);
  let requests = 0;
  const ao = geographicLocation(
    "Ao Nang",
    "Krabi, Thailand",
    8.03,
    98.82,
    "TH",
    "osm:R:200",
  );
  await page.route("**/api/locations?**", (route) => {
    requests++;
    const q = new URL(route.request().url()).searchParams.get("q");
    return route.fulfill({
      json: q?.startsWith("Ao")
        ? {
            results: [ao],
            presentations: {
              [ao.id]: { context: "Krabi, Thailand", type: "Town" },
            },
            worldwideAvailable: true,
            status: "ok",
          }
        : curatedReply(),
    });
  });
  await page.getByRole("textbox", { name: /Trip name/ }).fill("Island escape");
  const field = page.getByRole("combobox", {
    name: "Destination",
    exact: true,
  });
  await field.fill("Koh Lanta, Thailand");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(5);
  await expect(
    page.getByText("Krabi, Thailand · Island", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/nearby town|Coordinates or map link|map position/),
  ).toHaveCount(0);
  await searchCapture(page, "five-suggestions", info.project.name);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(info.project.use.viewport!);
  const more = page.getByRole("button", { name: "Show more results" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(7);
  expect(requests).toBe(1);
  await searchCapture(page, "expanded-suggestions", info.project.name);
  await page
    .getByRole("option", {
      name: "Ko Lanta, Krabi, Thailand · Island",
      exact: true,
    })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Add destination", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Destination 2", exact: true })
    .fill("Ao Nang");
  await page
    .getByRole("option", {
      name: "Ao Nang, Krabi, Thailand · Town",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Move destination 2 up" }).click();
  await page.locator('[name="start_date"]').fill("2027-06-01");
  await page.locator('[name="end_date"]').fill("2027-06-08");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your basics are safely saved." }),
  ).toBeVisible();
  const rows = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fixture:private-trip-drafts") || "[]"),
  );
  expect(
    rows[0].draft_data.destinations.map((d: { id: string }) => d.id),
  ).toEqual([ao.id, curatedChoices[0].location.id]);
  await mount(page, `?draft=${rows[0].id}&step=1`);
  await expect(
    page.getByRole("combobox", { name: "Destination 1", exact: true }),
  ).toHaveValue(ao.label);
  await expect(
    page.getByRole("combobox", { name: "Destination 2", exact: true }),
  ).toHaveValue(curatedChoices[0].location.label);
});
test("provider rate limits and outages show one recoverable message instead of no matches", async ({
  page,
}, info) => {
  await mount(page);
  let requests = 0;
  await page.route("**/api/locations?**", (route) => {
    requests++;
    return route.fulfill({
      json:
        requests === 1
          ? {
              results: [],
              worldwideAvailable: false,
              status: "rate_limited",
              retryAfterSeconds: 1,
            }
          : curatedReply(),
    });
  });
  const field = page.getByRole("combobox", {
    name: "Destination",
    exact: true,
  });
  await field.fill("Koh Lanta");
  await expect(
    page.getByText("Search is busy. Try again shortly.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/No matches/)).toHaveCount(0);
  await searchCapture(page, "rate-limit", info.project.name);
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeEnabled();
  expect(requests).toBe(1);
  await retry.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(5);
  expect(requests).toBe(2);
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({
      json: {
        results: [],
        worldwideAvailable: true,
        status: "ok",
        presentations: {},
      },
    }),
  );
  await field.fill("Unlisted cove");
  await expect(
    page.getByText("No matches. Try another spelling or add the country.", {
      exact: true,
    }),
  ).toBeVisible();
  await searchCapture(page, "empty-search", info.project.name);
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({
      json: {
        results: [],
        worldwideAvailable: false,
        status: "unavailable",
        retryAfterSeconds: 1,
      },
    }),
  );
  await field.fill("Koh Lanta again");
  await expect(
    page.getByText("Search is temporarily unavailable. Try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/No matches/)).toHaveCount(0);
  await searchCapture(page, "provider-unavailable", info.project.name);
});
