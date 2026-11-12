import { test, expect, type Page, type TestInfo } from "@playwright/test";
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
        entry: resolve("tests/fixtures/booking-budget-browser.tsx"),
        formats: ["iife"],
        name: "MoneyFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
async function mount(page: Page, mode = "normal") {
  await page.goto("/login?mode=" + mode);
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.setContent(
    '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await expect(
    page.getByRole("heading", { name: "Your bookings", exact: true }),
  ).toBeVisible();
}
async function budget(page: Page) {
  await page
    .getByRole("navigation", { name: "Trip sections", exact: true })
    .getByRole("link", { name: "Budget", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your budget", exact: true }),
  ).toBeVisible();
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "tests/screenshots/phase9/" + info.project.name + "/" + name + ".png",
    fullPage: true,
  });
}
test("bookings overview and details keep review distinct, protect confirmations and fit the full viewport", async ({
  page,
}, info) => {
  await mount(page);
  const card = page.getByRole("article", {
    name: "Museum reservation",
    exact: true,
  });
  await expect(card.getByText("Needs review", { exact: true })).toBeVisible();
  await expect(card.getByText("confirmed", { exact: true })).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(info.project.use.viewport!);
  await shot(page, info, "bookings");
  await card.getByRole("button", { name: "View details", exact: true }).click();
  const details = page.getByRole("region", {
    name: "Booking details",
    exact: true,
  });
  await expect(details).toBeVisible();
  await expect(
    details.getByRole("link", { name: /Open confirmation/ }),
  ).toHaveAttribute("href", /^\/api\/attachments\//);
  await expect(
    details.getByText("A saved museum visit", { exact: true }),
  ).toBeVisible();
  await shot(page, info, "booking-details");
});
test("manual booking saves, edits independent review/status, filters, refreshes and cancels removal", async ({
  page,
}) => {
  await mount(page, "empty");
  await page.getByRole("button", { name: "Add booking", exact: true }).click();
  const form = page.getByRole("form", { name: "Booking editor" });
  await form
    .getByLabel("Booking name", { exact: true })
    .fill("A new reservation");
  await form.getByLabel("Start date", { exact: true }).fill("2027-05-02");
  await form.getByLabel("End date", { exact: true }).fill("2027-05-02");
  await form
    .getByLabel("Review status", { exact: true })
    .selectOption("user confirmed");
  await form
    .getByLabel("Reservation status", { exact: true })
    .selectOption("pending");
  await form.getByRole("button", { name: "Save booking", exact: true }).click();
  const card = page.getByRole("article", {
    name: "A new reservation",
    exact: true,
  });
  await expect(card.getByText("Reviewed", { exact: true })).toBeVisible();
  await expect(card.getByText("pending", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await form
    .getByLabel("Reservation status", { exact: true })
    .selectOption("cancelled");
  await form.getByRole("button", { name: "Save booking", exact: true }).click();
  await expect(card.getByText("cancelled", { exact: true })).toBeVisible();
  await mount(page, "empty");
  await expect(card).toBeVisible();
  await page
    .getByLabel("Filter reservation status", { exact: true })
    .selectOption("pending");
  await expect(card).toHaveCount(0);
  await page
    .getByLabel("Filter reservation status", { exact: true })
    .selectOption("cancelled");
  await expect(card).toBeVisible();

  page.once("dialog", (d) => d.dismiss());
  await card.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(card).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(card).toHaveCount(0);
});
test("budget uses expense-only remaining, separates currencies, saves target without style changes and supports expense CRUD", async ({
  page,
}, info) => {
  await mount(page);
  await budget(page);
  await expect(page.getByText("EUR 460.00", { exact: true })).toBeVisible();
  await expect(
    page.getByText("USD 25.00", { exact: true }).first(),
  ).toBeVisible();
  await shot(page, info, "budget");
  await page.getByRole("button", { name: "Edit budget", exact: true }).click();
  await page.getByLabel("Trip budget amount", { exact: true }).fill("600");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(page.getByText("EUR 560.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const form = page.getByRole("form", { name: "Expense editor" });
  await expect(form.getByLabel("Expense name", { exact: true })).toBeFocused();
  await form.getByLabel("Expense name", { exact: true }).fill("A nice lunch");
  await form.getByLabel("Amount", { exact: true }).fill("12.50");
  await form
    .getByLabel("Expense category", { exact: true })
    .fill("Food & Drink");
  await form
    .getByLabel("Related booking (optional)", { exact: true })
    .selectOption(initialBooking);
  await shot(page, info, "expense-creation");
  await form.getByRole("button", { name: "Save expense", exact: true }).click();
  const row = page.getByRole("article", { name: "A nice lunch", exact: true });
  await expect(row).toContainText("Related booking: Museum reservation");
  await page
    .getByLabel("Filter expenses by category", { exact: true })
    .selectOption("Activities");
  await expect(row).toHaveCount(0);
  await page
    .getByLabel("Filter expenses by category", { exact: true })
    .selectOption("all");
  await expect(row).toBeVisible();

  await expect(page.getByText("EUR 547.50", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Edit expense", exact: true }).click();
  await form.getByLabel("Amount", { exact: true }).fill("15");
  await form.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(row).toContainText("EUR 15.00");
  await mount(page);
  await budget(page);
  await expect(row).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await row
    .getByRole("button", { name: "Delete expense", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("EUR 560.00", { exact: true })).toBeVisible();
});
const initialBooking = "33333333-3333-4333-8333-333333333333";
test("multiple uploads retain originals on extraction failure and keep grouped review available", async ({
  page,
}, info) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Upload confirmation / review", exact: true })
    .click();
  await page.locator("input[type=file][multiple]").setInputFiles([
    {
      name: "first.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nfixture"),
    },
    {
      name: "second.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nfixture2"),
    },
  ]);
  await expect(page.locator(".collection-entry")).toHaveCount(2);
  const first = page.locator(".collection-entry").first();
  await first
    .getByText("Read or retry reading this saved file", { exact: false })
    .click();
  await first.getByRole("checkbox").check();
  await first
    .getByRole("button", { name: "Read saved file", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "original file is still saved",
  );
  await expect(
    first.getByRole("link", { name: /Open saved file/ }),
  ).toHaveAttribute("href", /^\/api\/attachments\//);
  await first
    .getByRole("button", { name: "Review / edit", exact: true })
    .click();
  await expect(first.getByLabel("Booking name", { exact: true })).toBeVisible();
  await shot(page, info, "booking-review");
});
test("failed saves preserve inputs and viewer/missing-migration states prohibit new writes", async ({
  page,
}) => {
  await mount(page, "failure");
  await budget(page);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const form = page.getByRole("form", { name: "Expense editor" });
  await form
    .getByLabel("Expense name", { exact: true })
    .fill("Keep my expense");
  await form.getByLabel("Amount", { exact: true }).fill("9");
  await form.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("input is preserved");
  await expect(form.getByLabel("Expense name", { exact: true })).toHaveValue(
    "Keep my expense",
  );
  await form.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Keep my expense", exact: true }),
  ).toBeVisible();
  await mount(page, "viewer");
  await expect(
    page.getByRole("button", { name: "Add booking", exact: true }),
  ).toHaveCount(0);
  await budget(page);
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toHaveCount(0);
  await mount(page, "pending");
  await expect(
    page.getByRole("button", { name: "Add booking", exact: true }),
  ).toBeDisabled();
  await budget(page);
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toBeDisabled();
});
