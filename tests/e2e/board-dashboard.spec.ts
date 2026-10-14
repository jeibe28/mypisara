import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function newBoard(page: Page, name: string) {
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Back to boards" }).click();
  await expect(page.getByRole("heading", { name: "Boards", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/demo");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("tiles can be favorited, sorted, renamed, duplicated and deleted", async ({ page }) => {
  await newBoard(page, "Zebra plans");
  await newBoard(page, "Apple ideas");

  await page.getByLabel("Sort boards").selectOption("name");
  const titles = page.locator(".board-preview-info h2");
  await expect(titles).toHaveText(["Apple ideas", "Zebra plans"]);

  await page.getByRole("button", { name: "Add Zebra plans to favorites" }).click();
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
  await expect(titles.first()).toHaveText("Zebra plans");

  await page.getByRole("button", { name: "Actions for Apple ideas" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByText("Apple ideas copy")).toBeVisible();

  await page.getByRole("button", { name: "Actions for Apple ideas copy" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Board name").fill("Apple archive");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Apple archive")).toBeVisible();

  await page.getByText("Apple archive").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to trash…" }).click();
  await page.getByRole("button", { name: "Move to trash", exact: true }).click();
  await expect(page.locator(".board-preview-info h2", { hasText: "Apple archive" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Moved “Apple archive” to trash" })).toBeVisible();

  // Trash keeps it, and it can be restored or removed for good.
  await page.getByRole("button", { name: /^Trash/ }).click();
  await expect(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
  await expect(page.locator(".trash-list").getByText("Apple archive")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Trash is empty")).toBeVisible();
  await page.getByRole("button", { name: /^All boards/ }).click();
  await expect(page.locator(".board-preview-info h2", { hasText: "Apple archive" })).toBeVisible();
  await page.getByRole("button", { name: "Actions for Apple archive" }).click();
  await page.getByRole("menuitem", { name: "Move to trash…" }).click();
  await page.getByRole("button", { name: "Move to trash", exact: true }).click();
  await page.getByRole("button", { name: /^Trash/ }).click();
  await page.getByRole("button", { name: "Delete forever" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByText("Trash is empty")).toBeVisible();
  await page.getByRole("button", { name: /^All boards/ }).click();

  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".boards-grid.is-list").first()).toBeVisible();
  await page.reload();
  await expect(page.locator(".boards-grid.is-list").first()).toBeVisible();
});

test("a board exports as Markdown, PNG, PDF and a backup that imports back", async ({ page }) => {
  await newBoard(page, "Export me");
  await page.getByText("Export me").click();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Remember the milk");
  await page.getByLabel("Notes", { exact: true }).press("Escape");

  async function exportAs(format: string) {
    await page.getByRole("button", { name: "Board menu" }).click();
    await page.getByRole("menuitem", { name: "Export…" }).click();
    await page.getByRole("radio", { name: new RegExp(format) }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export", exact: true }).click(),
    ]);
    const path = await download.path();
    return { name: download.suggestedFilename(), data: await readFile(path!) };
  }

  const markdown = await exportAs("Markdown");
  expect(markdown.name).toMatch(/^Export me – \d{4}-\d{2}-\d{2}\.md$/);
  expect(markdown.data.toString()).toContain("# Export me");
  expect(markdown.data.toString()).toContain("Remember the milk");

  const png = await exportAs("Image \\(PNG\\)");
  expect([...png.data.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(png.data.length).toBeGreaterThan(1000);

  const jpeg = await exportAs("Image \\(JPEG\\)");
  expect(jpeg.name).toMatch(/\.jpg$/);
  expect([...jpeg.data.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

  const pdf = await exportAs("^PDF");
  expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.data.subarray(-6).toString()).toContain("%%EOF");

  const backup = await exportAs("Backup");
  expect(JSON.parse(backup.data.toString()).title).toBe("Export me");

  await page.getByRole("button", { name: "Back to boards" }).click();
  await page.getByLabel("Import a board backup").setInputFiles({
    name: backup.name,
    mimeType: "application/json",
    buffer: backup.data,
  });
  await expect(page.getByRole("status").filter({ hasText: /Imported/ })).toBeVisible();
  await expect(page.locator(".board-preview-info h2", { hasText: "Export me" })).toHaveCount(2);
});

test("new boards can start from a template", async ({ page }) => {
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.getByRole("radio", { name: /Kanban/ }).click();
  await page.getByLabel("Board name").fill("Work board");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name: "Work board" })).toBeVisible();
  await expect(page.locator(".board-card-column")).toHaveCount(3);
  await expect(page.getByText("Doing", { exact: true }).first()).toBeVisible();
});
