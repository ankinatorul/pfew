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
  await page.addScriptTag({ content: bundle });
  await expect(page.locator("#workspace-content")).toBeVisible();
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: `tests/screenshots/collaboration-v1b/${info.project.name}/${name}.png`,
    fullPage: true,
  });
}
test("owner invites, copies, safely replaces/revokes links and removes collaborators in a keyboard-accessible drawer", async ({
  page,
}, info) => {
  await mount(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Invite by email")).toBeFocused();
  await drawer.getByLabel("Invite by email").fill("newfriend@example.com");
  await drawer.getByRole("button", { name: "Create invitation link" }).click();
  await expect(
    drawer.getByText("No invitation email has been sent by Pfew."),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem("fixture:copied", text);
        },
      },
    });
  });
  await drawer.getByRole("button", { name: "Copy invitation link" }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("fixture:copied")),
  ).toMatch(/\/invites\/[a-f0-9]{64}$/);
  await shot(page, info, "owner-sharing");
  page.once("dialog", (d) => d.dismiss());
  await drawer.getByRole("button", { name: "Remove collaborator" }).click();
  await expect(
    drawer.getByText("friend@example.com", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await drawer.getByRole("button", { name: "Remove collaborator" }).click();
  await expect(
    drawer.getByText("friend@example.com", { exact: true }),
  ).toHaveCount(0);
  const pending = drawer
    .getByRole("article")
    .filter({ hasText: "pending@example.com" });
  page.once("dialog", (d) => d.accept());
  await pending.getByRole("button", { name: "Create new link" }).click();
  await expect(
    drawer.getByText("Link ready for pending@example.com"),
  ).toBeVisible();
  const replacement = drawer
    .getByRole("article")
    .filter({ hasText: "pending@example.com" });
  page.once("dialog", (d) => d.accept());
  await replacement.getByRole("button", { name: "Revoke invitation" }).click();
  await expect(
    drawer.getByText("Link ready for pending@example.com"),
  ).toHaveCount(0);
  await drawer.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toBeFocused();
});
test("valid invitation accepts with explicit Open trip and activates the shared trip", async ({
  page,
}, info) => {
  await mount(page, "invite-valid");
  await page.getByRole("button", { name: "Accept invitation" }).click();
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
test("recipient inbox declines cleanly and document sharing stays explicit and uploader-controlled", async ({
  page,
}, info) => {
  await mount(page);
  const inbox = page.getByRole("region", { name: "Pending invitations" });
  await shot(page, info, "inbox-and-privacy");
  await inbox.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(inbox).toContainText("Invitation declined");
  await inbox.getByRole("button", { name: "Dismiss" }).click();
  await expect(inbox).toHaveCount(0);
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
    await expect(drawer.getByLabel("Invite by email")).toHaveCount(0);
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
    await expect(
      page.getByRole("button", { name: "Accept invitation" }),
    ).toHaveCount(0);
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
