import { test, expect, type Page } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "Pointer-driven flows are covered on desktop.");

async function newBoard(page: Page, title: string) {
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await page.getByLabel("Board name").fill(title);
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}
async function addNote(page: Page, text: string) {
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill(text);
  await page.getByLabel("Notes", { exact: true }).press("Escape");
}
const position = (page: Page, text: string) =>
  page.locator(".board-card", { hasText: text }).first().evaluate((el) => ({ x: (el as HTMLElement).style.left, y: (el as HTMLElement).style.top }));

test.beforeEach(async ({ page }) => {
  await page.goto("/demo");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("a locked card cannot be dragged until it is unlocked", async ({ page }) => {
  await newBoard(page, "Lock test");
  await addNote(page, "Anchor");
  const card = page.locator(".board-card", { hasText: "Anchor" }).first();
  const before = await position(page, "Anchor");
  await page.getByRole("button", { name: "Lock position" }).click();
  await expect(card).toHaveAttribute("data-locked", "true");
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 160, { steps: 8 });
  await page.mouse.up();
  expect(await position(page, "Anchor")).toEqual(before);

  await page.getByRole("button", { name: "Unlock position" }).click();
  const unlocked = (await card.boundingBox())!;
  await page.mouse.move(unlocked.x + 40, unlocked.y + 30);
  await page.mouse.down();
  await page.mouse.move(unlocked.x + 240, unlocked.y + 160, { steps: 8 });
  await page.mouse.up();
  expect(await position(page, "Anchor")).not.toEqual(before);
});

test("to-do cards show progress, can hide completed items, and notes collapse to a title", async ({ page }) => {
  await newBoard(page, "Quick wins");
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  const add = page.getByLabel("New checklist item");
  for (const text of ["One", "Two", "Three"]) {
    await add.fill(text);
    await add.press("Enter");
  }
  await page.getByRole("button", { name: "Save card" }).click();
  await page.getByRole("checkbox", { name: "One" }).check();
  await expect(page.getByText("1 / 3")).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Hide completed" }).click();
  await expect(page.getByText("1 completed hidden")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "One" })).toHaveCount(0);
  await expect(page.getByText("1 / 3")).toBeVisible();
  await page.getByRole("button", { name: "Show completed" }).click();

  await page.getByRole("button", { name: "Collapse card" }).click();
  await expect(page.locator(".board-collapsed")).toContainText("Two");
  await expect(page.locator(".board-collapsed")).toContainText("1/3");
  await page.locator(".board-collapsed").dblclick();
  await expect(page.locator(".board-collapsed")).toHaveCount(0);
});

test("tags and search dim everything that does not match", async ({ page }) => {
  await newBoard(page, "Find things");
  await addNote(page, "Apple plan");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByLabel("Add tag").fill("fruit");
  await page.getByLabel("Add tag").press("Enter");
  await expect(page.locator(".board-card", { hasText: "Apple plan" }).getByText("#fruit")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Board canvas").click({ position: { x: 700, y: 400 } });
  await addNote(page, "Banana plan");

  await page.getByRole("button", { name: "Search board" }).click();
  await page.getByLabel("Search this board").fill("banana");
  await expect(page.getByRole("status").filter({ hasText: "1 of 1" })).toBeVisible();
  await expect(page.locator(".board-card", { hasText: "Apple plan" })).toHaveAttribute("data-dim", "true");
  await expect(page.locator(".board-card", { hasText: "Banana plan" })).not.toHaveAttribute("data-dim", "true");

  await page.getByLabel("Search this board").fill("");
  await page.getByRole("group", { name: "Filter by tag" }).getByRole("button", { name: "#fruit" }).click();
  await expect(page.locator(".board-card", { hasText: "Banana plan" })).toHaveAttribute("data-dim", "true");
  await expect(page.locator(".board-card", { hasText: "Apple plan" })).not.toHaveAttribute("data-dim", "true");

  await page.getByRole("button", { name: "Close search" }).click();
  await expect(page.locator(".board-card[data-dim]")).toHaveCount(0);
});

test("cards can be moved to another board", async ({ page }) => {
  await newBoard(page, "Destination");
  await page.getByRole("button", { name: "Back to boards" }).click();
  await newBoard(page, "Origin");
  await addNote(page, "Travelling note");
  await page.locator(".board-card", { hasText: "Travelling note" }).first().click({ button: "right", position: { x: 20, y: 20 } });
  await page.getByRole("menuitem", { name: "Move to board…" }).click();
  await page.getByRole("menuitem", { name: "Destination" }).click();
  await expect(page.getByRole("status").filter({ hasText: "to “Destination”" })).toBeVisible();
  await expect(page.locator(".board-card", { hasText: "Travelling note" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back to boards" }).click();
  await page.locator(".board-preview-info h2", { hasText: "Destination" }).click();
  await expect(page.locator(".board-card", { hasText: "Travelling note" })).toHaveCount(1);
});
