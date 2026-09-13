import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: "playwright/.auth/cae.json" });

test("module admin page has no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/settings/modules");
  await page.waitForSelector("h1");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});

test("the add-statement side panel traps focus and closes on Escape", async ({
  page,
}) => {
  await page.goto("/settings/modules");
  await page.getByRole("button", { name: "Add bank statement" }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((node) => node.contains(node.ownerDocument.activeElement)),
    )
    .toBe(true);

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        dialog.evaluate((node) => node.contains(node.ownerDocument.activeElement)),
      )
      .toBe(true);
  }

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        dialog.evaluate((node) => node.contains(node.ownerDocument.activeElement)),
      )
      .toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
