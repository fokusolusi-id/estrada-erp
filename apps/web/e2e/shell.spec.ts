import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
import { navFor } from "../src/lib/nav";
import { authFile, E2E_USERS, type E2eRole } from "./users";

/** The app shell: header and sidebar stay put while a page scrolls, and every page sits in the same column. */
async function as(role: E2eRole, page: Page, path: string) {
  const state = JSON.parse(readFileSync(authFile(role), "utf8")) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto(path);
}

/** Left edge and width of the page's own root element. */
async function column(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Memuat halaman" })).toHaveCount(0);
  return page.locator("main h1").first().evaluate((h1) => {
    const main = h1.closest("main")!;
    let root: Element = h1;
    while (root.parentElement !== main && !root.parentElement!.hasAttribute("data-page")) root = root.parentElement!;
    const { x, width } = root.getBoundingClientRect();
    return { x: Math.round(x), width: Math.round(width) };
  });
}

for (const width of [1440, 1920]) {
  test(`every page shares one left edge and width at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    test.setTimeout(240_000);
    // Admin's Beranda and Rekening are the pair that differed; then every other screen once, as the first role that has it.
    const visits = new Map<string, [E2eRole, string]>([
      ["admin /", ["admin", "/"]],
      ["admin /pembayaran/rekening", ["admin", "/pembayaran/rekening"]],
      ["finance /pembayaran/rekening", ["finance", "/pembayaran/rekening"]],
      ["requestor /pembayaran/baru", ["requestor", "/pembayaran/baru"]],
    ]);
    for (const role of Object.keys(E2E_USERS) as E2eRole[]) {
      for (const s of navFor(E2E_USERS[role].role, (unit) => unit === E2E_USERS[role].orgUnit)) {
        if (!s.phase && !visits.has(s.href)) visits.set(s.href, [role, s.href]);
      }
    }
    const found: Record<string, string> = {};
    for (const [key, [role, href]] of visits) {
      await as(role, page, href);
      found[key] = JSON.stringify(await column(page));
    }
    expect(found).toEqual(Object.fromEntries(Object.keys(found).map((k) => [k, Object.values(found)[0]])));
  });
}

test("the Panduan text fills the same column as every page", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await as("admin", page, "/panduan");
  const { x, width } = await column(page);
  const article = (await page.locator("main article").boundingBox())!;
  expect(Math.round(article.x + article.width)).toBe(x + width);
});

test("header and sidebar stay in place on a long page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await as("admin", page, "/panduan");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  expect((await page.locator("header").first().boundingBox())!.y).toBeCloseTo(0, 0); // sub-pixel
  expect((await page.locator("aside").first().boundingBox())!.y).toBeCloseTo(0, 0); // sub-pixel
  // A short window: the menu scrolls inside the sidebar, so its last link is still reachable.
  const last = page.locator("aside").getByRole("link").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test("the app menu scrolls by itself to the page you are on", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 400 });
  await as("admin", page, "/panduan#alur-rka");
  await expect(page.locator("aside").getByRole("link", { name: "Panduan" })).toBeInViewport();
});

test("the Panduan contents list scrolls along with the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 400 });
  await as("admin", page, "/panduan#alur-rka");
  const links = page.getByRole("navigation", { name: "Daftar isi panduan" }).getByRole("link");
  await expect(links.first()).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(links.last()).toHaveAttribute("aria-current", "location");
  await expect(links.last()).toBeInViewport();
});

test("on a phone the header stays and the open menu scrolls to its last link", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 420 });
  await as("admin", page, "/panduan");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 2000));
  expect((await page.locator("header").first().boundingBox())!.y).toBeCloseTo(0, 0); // sub-pixel
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const last = page.getByRole("navigation", { name: "Menu utama" }).getByRole("link").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

for (const width of [320, 768, 844]) {
  test(`no page scrolls sideways at ${width} px`, async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ baseURL, viewport: { width, height: 700 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const visits = new Map<string, E2eRole>([["/", "admin"], ["/pembayaran/rekening", "admin"], ["/pembayaran/baru", "requestor"]]);
    for (const role of Object.keys(E2E_USERS) as E2eRole[]) {
      for (const s of navFor(E2E_USERS[role].role, (unit) => unit === E2E_USERS[role].orgUnit)) {
        if (!s.phase && !visits.has(s.href)) visits.set(s.href, role);
      }
    }
    const wide: Record<string, number> = {};
    for (const [href, role] of visits) {
      await as(role, page, href);
      await column(page);
      // A phone browser widens its viewport to fit what overflows, so measure against the device width.
      const over = (await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth))) - width;
      if (over > 0) wide[href] = over;
    }
    expect(wide).toEqual({});
    await context.close();
  });
}

test("at 320 px the Admin can still open the menu", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await as("admin", page, "/");
  await column(page);
  await page.getByRole("button", { name: "Menu", exact: true }).click({ timeout: 5_000 });
  await expect(page.getByRole("navigation", { name: "Menu utama" })).toBeVisible();
});

test("on a desktop the master and bank forms keep their column headings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await as("admin", page, "/admin/master");
  await expect(page.locator("main").getByText("Induk", { exact: true }).first()).toBeVisible();
  await as("admin", page, "/pembayaran/rekening");
  await expect(page.locator("main").getByText("Nomor rekening", { exact: true }).first()).toBeVisible();
});
