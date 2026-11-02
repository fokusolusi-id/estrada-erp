import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
import { navFor } from "../src/lib/nav";
import { authFile, E2E_USERS, type E2eRole } from "./users";

/**
 * Every live screen at phone width (client: support responsive). Runs after the journeys, so the screens carry data.
 * Wide tables scroll inside their card; the page itself never scrolls sideways, and the menu is one tap away.
 */
async function as(role: E2eRole, page: Page, path: string) {
  const state = JSON.parse(readFileSync(authFile(role), "utf8")) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto(path);
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const role of Object.keys(E2E_USERS) as E2eRole[]) {
  test(`${role}: every screen fits a phone, and the menu reaches each one`, async ({ page }) => {
    const screens = navFor(E2E_USERS[role].role).filter((n) => !n.phase);
    for (const s of screens) {
      await as(role, page, s.href);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await overflow(page), `${s.href} scrolls sideways`).toBeLessThanOrEqual(0);
    }

    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("navigation", { name: "Menu utama" });
    for (const s of screens) await expect(menu.getByRole("link", { name: s.label })).toBeVisible();
    await menu.getByRole("link", { name: screens.at(-1)!.label }).click();
    await expect(page).toHaveURL(new RegExp(`${screens.at(-1)!.href}$`));
  });
}

test("the login page fits a phone", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Masuk/ })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
