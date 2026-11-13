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
    path:
      "tests/screenshots/phase11a-unified/" +
      info.project.name +
      "/" +
      name +
      ".png",
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
  await card.getByLabel("More actions for Museum reservation").click();
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
test("shared manual creation, saved booking editing, deadline persistence and safe removal", async ({
  page,
}, info) => {
  await mount(page, "empty");
  await expect(page.locator(".collection-options")).toHaveCount(1);
  if (info.project.name === "desktop") {
    const size = await page
      .getByRole("button", { name: "Add manually", exact: true })
      .boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(180);
  }
  await shot(page, info, "bookings-empty");
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Name", { exact: true }).fill("A new reservation");
  await drawer.getByRole("radio", { name: "Experience", exact: true }).check();
  await drawer.getByLabel("Date", { exact: true }).fill("2027-05-02");
  await drawer.getByRole("radio", { name: "Pay later", exact: true }).check();
  await drawer.getByLabel("Payment due").fill("2027-04-01");
  await drawer
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  const card = page.getByRole("article", {
    name: "A new reservation",
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(page.locator(".collection-options")).toBeVisible();
  await card
    .getByRole("button", { name: "A new reservation", exact: true })
    .click();
  await expect(drawer.getByLabel("Payment due")).toHaveValue("2027-04-01");
  await drawer.getByLabel("Name", { exact: true }).fill("Updated reservation");
  await drawer
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  const updated = page.getByRole("article", {
    name: "Updated reservation",
    exact: true,
  });
  await expect(updated).toBeVisible();
  await shot(page, info, "saved-cards");
  await mount(page, "empty");
  await expect(updated).toBeVisible();
  await updated.getByLabel("More actions for Updated reservation").click();
  page.once("dialog", (d) => d.dismiss());
  await updated.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(updated).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await updated.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(updated).toHaveCount(0);
});
test("existing booking drawers share Stay/Transport fields, preserve status and protect unsaved changes", async ({
  page,
}, info) => {
  await mount(page);
  const card = page.getByRole("article", {
    name: "Museum reservation",
    exact: true,
  });
  await card
    .getByRole("button", { name: "Museum reservation", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Name", { exact: true })).toHaveValue(
    "Museum reservation",
  );
  await expect(drawer.locator(".booking-review-check")).toHaveCSS(
    "flex-direction",
    "row",
  );
  await expect(drawer.getByRole("combobox", { name: "Category" })).toHaveCount(
    0,
  );
  await drawer.getByRole("radio", { name: "Stay", exact: true }).check();
  await expect(
    drawer.getByLabel("Check-out date", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `tests/screenshots/phase11a-unified/${info.project.name}/stay-drawer.png`,
  });
  await drawer.getByRole("radio", { name: "Transport", exact: true }).check();
  await expect(drawer.getByText("Pickup & drop-off (optional)")).toBeVisible();
  await page.screenshot({
    path: `tests/screenshots/phase11a-unified/${info.project.name}/transport-drawer.png`,
  });
  page.once("dialog", (d) => d.dismiss());
  await drawer.getByRole("button", { name: "Close booking editor" }).click();
  await expect(drawer).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await drawer.getByRole("button", { name: "Close booking editor" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(card.getByText("confirmed", { exact: true })).toBeVisible();
  await expect(card.getByText("Needs review", { exact: true })).toBeVisible();
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
  await expect(page.locator(".money-collection .collection-entry")).toHaveCount(
    2,
  );
  const first = page.locator(".money-collection .collection-entry").first();
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
  await first.getByLabel("More actions for first.pdf").click();
  await first
    .getByRole("button", { name: "Review / edit", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Name", { exact: true }),
  ).toBeVisible();
  await shot(page, info, "booking-review");
});
test("existing-trip drag and drop uses the shared upload area and retains both originals", async ({
  page,
}) => {
  await mount(page, "empty");
  await page.locator(".collection-dropzone").dispatchEvent("drop", {
    dataTransfer: await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(
        new File(["fixture-a"], "drop-a.pdf", { type: "application/pdf" }),
      );
      data.items.add(
        new File(["fixture-b"], "drop-b.png", { type: "image/png" }),
      );
      return data;
    }),
  });
  await expect(
    page.getByRole("link", { name: /Open saved file:/ }),
  ).toHaveCount(2);
  await expect(page.locator(".collection-options")).toBeVisible();
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
    page.getByRole("button", { name: "Add manually", exact: true }),
  ).toHaveCount(0);
  await budget(page);
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toHaveCount(0);
  await mount(page, "pending");
  await expect(
    page.getByRole("button", { name: "Add manually", exact: true }),
  ).toBeDisabled();
  await budget(page);
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toBeDisabled();
});
