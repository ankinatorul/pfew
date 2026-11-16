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
        entry: resolve("tests/fixtures/collaboration-browser.tsx"),
        formats: ["iife"],
        name: "CollaborationFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
async function mount(page: Page, mode = "owner") {
  // Only load public CSS from Next.js; all collaboration operations run in memory.
  await page.goto("/login?mode=" + mode);
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.setContent(
    '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  // Next Image is reused by AccountAvatar; provide its process shim in this Vite-only fixture.
  await page.addScriptTag({
    content:
      'globalThis.process = { env: { NODE_ENV: "production" }, browser: true };',
  });
  await page.addScriptTag({ content: bundle });
  await expect(page.locator("#workspace-content")).toBeVisible();
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: `tests/screenshots/reusable-trip-sharing/${info.project.name}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
test("owner enables one reusable link, copies, resets, disables and removes a member", async ({
  page,
}, info) => {
  await mount(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Email address")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Pending invitations" }),
  ).toHaveCount(0);
  await drawer.getByRole("button", { name: "Enable sharing" }).click();
  const original = await drawer.getByLabel("Sharing URL").inputValue();
  await drawer.press("Escape");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(drawer.getByLabel("Sharing URL")).toHaveValue(original);
  await shot(page, info, "owner-sharing");
  page.once("dialog", (d) => d.accept());
  await drawer.getByRole("button", { name: "Reset link" }).click();
  await expect(drawer.getByLabel("Sharing URL")).not.toHaveValue(original);
  await expect(drawer.getByText("Mark", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await drawer.getByRole("button", { name: "Remove collaborator" }).click();
  await expect(drawer.getByText("Mark", { exact: true })).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await drawer.getByRole("button", { name: "Disable sharing" }).click();
  await expect(drawer.getByRole("button", { name: "Copy link" })).toHaveCount(
    0,
  );
  await expect(
    drawer.getByRole("button", { name: "Enable sharing" }),
  ).toBeVisible();
});

test("valid invitation accepts with explicit Open trip and activates the shared trip", async ({
  page,
}, info) => {
  await mount(page, "invite-valid");
  await page.getByRole("button", { name: "Join trip" }).click();
  await expect(page.getByText("You’re in!")).toBeVisible();
  const open = page.getByRole("link", { name: "Open trip", exact: true });
  await expect(open).toHaveAttribute("href", /\/trips\//);
  await shot(page, info, "accepted");
  await open.evaluate((node) =>
    node.addEventListener("click", (e) => e.preventDefault()),
  );
  await open.click();
  expect(
    await page.evaluate(() => localStorage.getItem("pfew:active-trip:editor")),
  ).toBe("11111111-1111-4111-8111-111111111111");
});
test("no invitation inbox and document sharing stays explicit and uploader-controlled", async ({
  page,
}, info) => {
  await mount(page);
  await expect(
    page.getByRole("region", { name: "Pending invitations" }),
  ).toHaveCount(0);
  await shot(page, info, "privacy");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Share with trip", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Make private" })).toHaveCount(
    0,
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Share with trip", exact: true })
    .click();
  await expect(
    page.getByText("Shared with trip", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByText("Shared with trip", { exact: true })).toHaveCount(
    0,
  );
  expect(
    await page
      .getByRole("article")
      .filter({ hasText: "Passport" })
      .getByRole("button")
      .count(),
  ).toBe(0);
});
test("editor and unavailable migration have no owner mutations; narrow viewports do not overflow", async ({
  page,
}, info) => {
  for (const mode of ["editor", "unavailable"]) {
    await mount(page, mode);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByLabel("Email address")).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Remove collaborator" }),
    ).toHaveCount(0);
    if (mode === "unavailable")
      await expect(
        drawer.getByText("Sharing isn’t available yet"),
      ).toBeVisible();
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize(info.project.use.viewport!);
    await shot(page, info, mode);
  }
});
test("wrong-account, expired, revoked and signed-out invitations offer safe recovery without trip details", async ({
  page,
}, info) => {
  for (const status of [
    "wrong_account",
    "expired",
    "revoked",
    "invalid",
    "signed_out",
  ]) {
    await mount(page, "invite-" + status);
    await expect(page.getByRole("button", { name: "Join trip" })).toHaveCount(
      0,
    );
    await expect(page.locator(".invitation-page")).not.toContainText(
      "A spring escape",
    );
    if (status === "wrong_account") {
      await expect(
        page.getByRole("button", { name: "Use a different account" }),
      ).toBeVisible();
      await shot(page, info, "wrong-account");
    }
    if (status === "signed_out")
      await expect(
        page.getByRole("link", { name: "Sign in to continue" }),
      ).toHaveAttribute("href", /next=/);
  }
});
test("shared avatars open a compact people panel with accurate identities, role-aware management and focus return", async ({
  page,
}, info) => {
  await mount(page, "many");
  const trigger = page.getByRole("button", {
    name: /Shared with 5 other people/,
  });
  await expect(trigger.locator(".account-avatar")).toHaveCount(3);
  await expect(trigger).toContainText("+3");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "People on this trip" });
  await expect(
    panel.getByRole("link", { name: "anna@example.com" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "friend@example.com" }),
  ).toBeVisible();
  await expect(panel.getByText("pending@example.com")).toHaveCount(0);
  const box = await panel.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(400);
  if (info.project.name === "mobile")
    expect(
      Math.abs(box!.y + box!.height - info.project.use.viewport!.height),
    ).toBeLessThan(3);
  await shot(page, info, "people");
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(info.project.use.viewport!);
  await panel.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await panel.getByRole("button", { name: "Manage sharing" }).click();
  const sharing = page.getByRole("dialog", { name: "Share this trip" });
  await expect(sharing).toBeVisible();
  await sharing.press("Escape");
  await expect(trigger).toBeFocused();
  await mount(page, "editor");
  await page
    .getByRole("button", { name: /Shared with 1 other person/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Manage sharing" }),
  ).toHaveCount(0);
  await shot(page, info, "editor-people");
  await mount(page, "solo");
  await expect(
    page.getByRole("button", { name: /View people on this trip/ }),
  ).toHaveCount(0);
});
test("copy feedback resets without layout movement and clipboard failure selects the manual URL", async ({
  page,
}, info) => {
  await mount(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Enable sharing" }).click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    }),
  );
  const before = await drawer
    .getByRole("button", { name: "Copy link", exact: true })
    .boundingBox();
  await drawer.getByRole("button", { name: "Copy link", exact: true }).click();
  const copied = drawer.getByRole("button", { name: "Copied!", exact: true });
  await expect(copied).toBeVisible();
  const after = await copied.boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
  await shot(page, info, "copied");
  await expect(
    drawer.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeVisible({ timeout: 4000 });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("fixture denied");
        },
      },
    }),
  );
  await drawer.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(drawer.getByRole("alert")).toContainText("Select the link");
  await expect(
    drawer.getByRole("button", { name: "Copied!", exact: true }),
  ).toHaveCount(0);
  const url = drawer.getByLabel("Sharing URL");
  await expect(url).toBeFocused();
  expect(await url.evaluate((e) => (e as HTMLInputElement).selectionEnd)).toBe(
    (await url.inputValue()).length,
  );
  await shot(page, info, "copy-failed");
});
