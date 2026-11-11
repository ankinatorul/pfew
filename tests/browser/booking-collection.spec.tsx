import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/booking-collection-browser.tsx"),
        formats: ["iife"],
        name: "BookingCollectionFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
async function mount(page: Page, query = "") {
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
const files = [
  {
    name: "fixture-flight.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fixture flight"),
  },
  {
    name: "fixture-stay.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fixture stay"),
  },
];
test("collects multiple sources and manual details in one review, distinguishes statuses and continues with unfinished entries", async ({
  page,
}, testInfo) => {
  await mount(page);
  await page
    .getByLabel("Upload confirmations", { exact: true })
    .setInputFiles(files);
  await expect(page.locator("article.collection-entry")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Open saved file/ })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  await expect(page.locator("article.collection-entry")).toHaveCount(3);
  const manual = page.locator("article.collection-entry").last();
  await manual
    .getByRole("button", { name: "Review / edit", exact: true })
    .click();
  await manual
    .getByLabel("Booking name", { exact: true })
    .fill("My manual flight");
  await manual
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("flight");
  await manual.getByLabel("Start date", { exact: true }).fill("2027-05-01");
  await manual.getByLabel("End date", { exact: true }).fill("2027-05-01");
  await manual
    .getByRole("button", { name: "Mark details reviewed", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "required booking fields",
  );
  await manual
    .getByLabel("Currency · three uppercase letters", { exact: true })
    .fill("EUR");
  await manual
    .getByRole("button", { name: "Mark details reviewed", exact: true })
    .click();
  await expect(manual.getByText("Reviewed", { exact: true })).toBeVisible();
  await expect(manual.getByText(/Reservation: unknown/)).toBeVisible();
  await expect(
    page.getByText(/3 added · 1 reviewed · 2 need review/),
  ).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(testInfo.project.use.viewport!);
  await page.evaluate(() => window.scrollTo(0, 0));
  await manual.locator(".collection-editor").evaluate((node) => {
    (node as HTMLDetailsElement).open = false;
  });
  await page.screenshot({
    path: testInfo.outputPath("booking-collection.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: testInfo.outputPath("booking-collection-viewport.png"),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Travel Style & Review is next" }),
  ).toBeVisible();
  await expect(page.getByText("1 reviewed · 2 need review")).toBeVisible();
  await expect(page.getByText("Private draft · not finalized")).toBeVisible();
  await mount(page);
  await expect(
    page.getByRole("heading", { name: "Travel Style & Review is next" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Add Bookings", exact: true })
    .click();
  await expect(page.locator("article.collection-entry")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Back to Trip Basics", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Trip Basics preserved" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to Add Bookings", exact: true })
    .click();
  await expect(page.locator("article.collection-entry")).toHaveCount(3);
});
test("retains originals after reading failure, retries from saved source, and safely removes or cancels", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByLabel("Upload confirmations", { exact: true })
    .setInputFiles(files[0]);
  const card = page.locator("article.collection-entry").first();
  await expect(
    card.getByRole("link", { name: /Open saved file/ }),
  ).toBeVisible();
  await card
    .getByText("Read or retry reading this saved file", { exact: true })
    .click();
  await card.getByRole("checkbox").check();
  await card
    .getByRole("button", { name: "Read saved file", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "original file is still saved",
  );
  await expect(
    card.getByRole("link", { name: /Open saved file/ }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Read saved file", exact: true })
    .click();
  await expect(card.getByText(/Fixture airline/).first()).toBeVisible();
  await expect(card.getByText("Needs review", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("article.collection-entry")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("article.collection-entry")).toHaveCount(0);
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Travel Style & Review is next" }),
  ).toBeVisible();
});
test("storage failure is honest, retry keeps the same entry, drafts are isolated and pasted text joins the group", async ({
  page,
}) => {
  await mount(page, "?failUpload=1");
  await page
    .getByLabel("Upload confirmations", { exact: true })
    .setInputFiles(files[0]);
  await expect(page.getByRole("alert")).toContainText("not confirmed");
  await expect(page.getByRole("link", { name: /Open saved file/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Retry upload", exact: true }).click();
  await expect(page.getByRole("link", { name: /Open saved file/ })).toHaveCount(
    1,
  );
  await expect(page.locator("article.collection-entry")).toHaveCount(1);
  await page
    .getByText("Paste confirmation text · no AI", { exact: true })
    .click();
  await page
    .getByLabel("Confirmation text", { exact: true })
    .fill("Provider: Reliable provider\nStart date: 2027-05-02");
  await page
    .getByRole("button", { name: "Read labeled text", exact: true })
    .click();
  await expect(page.locator("article.collection-entry")).toHaveCount(2);
  await expect(
    page
      .locator("article.collection-entry")
      .last()
      .getByRole("heading", { name: "Reliable provider", exact: true }),
  ).toBeVisible();
  await mount(page, "?trip=88888888-8888-4888-8888-888888888888");
  await expect(page.locator("article.collection-entry")).toHaveCount(0);
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByText("0 reviewed · 0 need review")).toBeVisible();
  await mount(page, "?failUpload=1");
  await expect(page.locator("article.collection-entry")).toHaveCount(2);
});

test("Continue preserves unsaved fields from several cards while saving them sequentially", async ({
  page,
}) => {
  await mount(page);
  for (const title of [
    "First reliable correction",
    "Second reliable correction",
  ]) {
    await page
      .getByRole("button", { name: "Add manually", exact: true })
      .click();
    const card = page.locator("article.collection-entry").last();
    await card
      .getByRole("button", { name: "Review / edit", exact: true })
      .click();
    await card.getByLabel("Booking name", { exact: true }).fill(title);
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Travel Style & Review is next" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Add Bookings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "First reliable correction",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Second reliable correction",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Needs review", { exact: true })).toHaveCount(2);
});
