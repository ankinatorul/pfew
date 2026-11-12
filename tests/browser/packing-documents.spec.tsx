import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    resolve: {
      alias: [
        {
          find: /.*app\/readiness-actions(?:\.ts)?$/,
          replacement: resolve("tests/fixtures/readiness-browser-actions.ts"),
        },
      ],
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/packing-documents-browser.tsx"),
        formats: ["iife"],
        name: "ReadinessFixture",
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
    .locator("link[rel=stylesheet]")
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.setContent(
    '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await expect(
    page.getByRole("heading", { name: "Your packing list", exact: true }),
  ).toBeVisible();
}
async function documents(page: Page) {
  await page
    .getByRole("navigation", { name: "Trip sections", exact: true })
    .getByRole("link", { name: "Documents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your documents", exact: true }),
  ).toBeVisible();
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path:
      "tests/screenshots/phase10/" + info.project.name + "/" + name + ".png",
    fullPage: true,
  });
}
test("packing layout, fast add, editing, completion, duplicate protection and refresh preserve real progress", async ({
  page,
}, info) => {
  await mount(page);
  await expect(
    page.getByRole("heading", { name: "1 of 2 items packed" }),
  ).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(info.project.use.viewport!);
  await screenshot(page, info, "packing");
  await page.getByLabel("Item name", { exact: true }).fill("A favorite hat");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const row = page.getByRole("group", { name: "A favorite hat", exact: true });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").check();
  await expect(
    page.getByRole("heading", { name: "2 of 3 items packed" }),
  ).toBeVisible();
  await page.getByLabel("Item name", { exact: true }).fill("A favorite hat");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(row).toHaveCount(1);
  await row
    .getByRole("button", { name: "Edit A favorite hat", exact: true })
    .click();
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page
    .getByLabel("Notes (optional)", { exact: true })
    .fill("Keep this with my bag");
  await screenshot(page, info, "packing-edit");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(row).toContainText("Quantity 3");
  await mount(page);
  await expect(row.getByRole("checkbox")).toBeChecked();
  page.once("dialog", (d) => d.accept());
  await row
    .getByRole("button", { name: "Delete A favorite hat", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});
test("starter suggestions require review, copy skips checked states, and reminders change only explicitly", async ({
  page,
}, info) => {
  await mount(page);
  await page
    .getByText("Build a reviewed packing checklist", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview packing suggestions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review packing additions" }),
  ).toBeVisible();
  await expect(
    page.getByText("Sun protection you use", { exact: false }).first(),
  ).toBeVisible();
  await screenshot(page, info, "packing-suggestions");
  await expect(
    page.getByRole("group", { name: "Sun protection you use", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: /I reviewed/ }).check();
  await page.getByRole("button", { name: /Add.*reviewed/ }).click();
  await expect(
    page.getByRole("group", { name: "Sun protection you use", exact: true }),
  ).toBeVisible();
  await page.getByText("Reuse a list or template", { exact: true }).click();
  await page
    .getByLabel("Saved list or template", { exact: true })
    .selectOption("copy:77777777-7777-4777-8777-777777777777");
  await page
    .getByRole("button", { name: "Copy new items", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "A copied hat", exact: true })
      .getByRole("checkbox"),
  ).not.toBeChecked();
  const reminder = page.getByRole("checkbox", { name: /Finish packing/ });
  await expect(reminder).not.toBeChecked();
  await reminder.check();
  await mount(page);
  await expect(
    page.getByRole("checkbox", { name: /Finish packing/ }),
  ).toBeChecked();
});
test("private documents, independent uploads, rename, filters and shortcut hiding preserve booking files", async ({
  page,
}, info) => {
  await mount(page);
  await documents(page);
  await screenshot(page, info, "documents");
  const booking = page.getByRole("article", {
    name: "Saved flight confirmation",
    exact: true,
  });
  await expect(
    booking.getByRole("link", { name: "Open / download", exact: true }),
  ).toHaveAttribute("href", /^\/api\/attachments\//);
  await booking
    .getByRole("button", { name: "Hide from Documents", exact: true })
    .click();
  await expect(booking).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Show hidden shortcuts", exact: true })
    .check();
  await expect(booking).toBeVisible();
  await booking
    .getByRole("button", { name: "Restore shortcut", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  const form = page.getByRole("form", { name: "Document upload", exact: true });
  await form.locator("input[type=file]").setInputFiles({
    name: "policy.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nfixture"),
  });
  await form.getByLabel("Document name", { exact: true }).fill("My policy");
  await form
    .getByLabel("Document category", { exact: true })
    .selectOption("Insurance");
  await screenshot(page, info, "document-upload");
  await form
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  let row = page.getByRole("article", { name: "My policy", exact: true });
  await expect(row).toBeVisible();
  await row
    .getByRole("button", { name: "Rename / organize", exact: true })
    .click();
  await page.getByLabel("Display name", { exact: true }).fill("Updated policy");
  await page
    .getByRole("button", { name: "Save document name", exact: true })
    .click();
  row = page.getByRole("article", { name: "Updated policy", exact: true });
  await expect(row).toBeVisible();
  await mount(page);
  await documents(page);
  await expect(row).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await row
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(row).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await row
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await expect(booking).toBeVisible();
});
test("empty progress, save failure, upload recovery, permissions and unapplied schema are honest", async ({
  page,
}) => {
  await mount(page, "empty");
  await expect(
    page.getByRole("heading", { name: "0 of 0 items packed" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start a packing list", exact: true })
    .click();
  await page.getByLabel("List name", { exact: true }).fill("First list");
  await page.getByRole("button", { name: "Save list", exact: true }).click();
  await expect(page.getByLabel("Item name", { exact: true })).toBeVisible();
  await mount(page, "toggle-failure");
  const failedToggle = page
    .getByRole("group", { name: "Charging cable", exact: true })
    .getByRole("checkbox");
  await failedToggle.check();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(failedToggle).not.toBeChecked();
  await expect(
    page.getByRole("heading", { name: "1 of 2 items packed", exact: true }),
  ).toBeVisible();
  await mount(page, "failure");
  await page.getByLabel("Item name", { exact: true }).fill("Keep my input");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("input is still here");
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
    "Keep my input",
  );
  await mount(page, "upload-failure");
  await documents(page);
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  const form = page.getByRole("form", { name: "Document upload", exact: true });
  await form.locator("input[type=file]").setInputFiles({
    name: "kept.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nfixture"),
  });
  await form
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Original saved");
  await form
    .getByRole("button", { name: "Check saved upload", exact: true })
    .click();
  await expect(
    page
      .getByRole("article", { name: "kept.pdf", exact: true })
      .getByRole("link", { name: "Open / download", exact: true }),
  ).toBeVisible();
  await mount(page, "viewer");
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toHaveCount(0);
  await documents(page);
  await expect(
    page.getByRole("button", { name: "Upload document", exact: true }),
  ).toHaveCount(0);
  await mount(page, "pending");
  await expect(page.getByLabel("Item name", { exact: true })).toHaveCount(0);
  await documents(page);
  await expect(
    page.getByRole("button", { name: "Upload document", exact: true }),
  ).toBeDisabled();
});
