import { expect, test as setup } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS, authFile, type E2eRole } from "./users";

// One login per role through the real login page; journeys reuse the saved sessions.
for (const role of Object.keys(E2E_USERS) as E2eRole[]) {
  setup(`log in as ${role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_USERS[role].email);
    await page.getByLabel("Kata sandi").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByRole("heading", { name: `Halo, ${E2E_USERS[role].name}` })).toBeVisible();
    await page.context().storageState({ path: authFile(role) });
  });
}
