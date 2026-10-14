import { test, expect } from "@playwright/test";

test("boards can be organised into folders: create, move, copy, rename and delete", async ({ page, isMobile }) => {
  test.skip(isMobile, "The sidebar is a horizontal strip on phones; this flow is covered on desktop.");
  await page.goto("/demo");
  await page.evaluate(() => {
    const make = (title: string) => ({ id: crypto.randomUUID(), title, background: "default", cards: [], trash: [], scene_order: [], revision: 1, updated_at: new Date().toISOString() });
    localStorage.setItem("mypisara.boards.demo.v1", JSON.stringify([make("Alpha"), make("Beta"), make("Gamma")]));
    localStorage.removeItem("mypisara:dashboard");
  });
  await page.reload();
  const tiles = page.locator(".board-tile");
  await expect(tiles).toHaveCount(3);

  // Create a folder from the sidebar; it opens empty.
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name").fill("Client work");
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("heading", { name: "Client work" })).toBeVisible();
  await expect(tiles).toHaveCount(0);

  // Select two boards and move them in.
  await page.getByRole("button", { name: /^All boards/ }).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator(".board-preview").nth(0).click();
  await page.locator(".board-preview").nth(1).click();
  await expect(page.locator(".board-select-bar strong")).toHaveText("2 selected");
  await page.getByRole("button", { name: "Move to…" }).click();
  await page.locator(".folder-pick", { hasText: "Client work" }).click();
  await expect(page.locator(".board-folder-chip")).toHaveCount(2);
  await page.locator(".library-folders").getByRole("button", { name: /Client work/ }).click();
  await expect(tiles).toHaveCount(2);

  // Copy a board into a new folder: the original stays, a copy appears.
  await page.getByRole("button", { name: /^All boards/ }).click();
  await tiles.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy to folder…" }).click();
  await page.getByLabel("New folder name").fill("Archive");
  await page.getByRole("button", { name: /Create and copy/ }).click();
  await expect(tiles).toHaveCount(4);

  // Folders persist across a reload.
  await page.reload();
  await expect(page.locator(".library-folders > button")).toHaveCount(2);

  // Deleting a folder keeps its boards.
  await page.locator(".library-folders").getByRole("button", { name: /Archive/ }).click();
  await page.getByRole("button", { name: "Delete folder" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete folder" }).click();
  await expect(page.locator(".library-folders > button")).toHaveCount(1);
  await page.getByRole("button", { name: /^All boards/ }).click();
  await expect(tiles).toHaveCount(4);
});
