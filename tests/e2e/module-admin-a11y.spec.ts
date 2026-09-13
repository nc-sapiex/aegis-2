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
  const focusables = dialog.locator(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  const focusableCount = await focusables.count();

  expect(focusableCount).toBeGreaterThan(0);

  async function getActiveDialogIndex() {
    return dialog.evaluate((node) => {
      const focusableElements = Array.from(
        node.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => !element.hasAttribute("disabled"));

      return focusableElements.indexOf(
        node.ownerDocument.activeElement as HTMLElement,
      );
    });
  }

  const initialIndex = await getActiveDialogIndex();
  expect(initialIndex).toBeGreaterThanOrEqual(0);

  let tabWrapped = false;

  for (let index = 0; index < focusableCount + 1; index += 1) {
    await page.keyboard.press("Tab");
    const activeIndex = await getActiveDialogIndex();

    expect(activeIndex).toBeGreaterThanOrEqual(0);

    if (activeIndex === initialIndex) {
      tabWrapped = true;
      break;
    }
  }

  expect(tabWrapped).toBe(true);

  let shiftTabWrapped = false;

  for (let index = 0; index < focusableCount + 1; index += 1) {
    await page.keyboard.press("Shift+Tab");
    const activeIndex = await getActiveDialogIndex();

    expect(activeIndex).toBeGreaterThanOrEqual(0);

    if (activeIndex === initialIndex) {
      shiftTabWrapped = true;
      break;
    }
  }

  expect(shiftTabWrapped).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
