import { test, expect, type Page } from "@playwright/test";
async function create(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await page.getByLabel("Board name").fill("Inline board");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inline board" }),
  ).toBeVisible();
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved/ }),
  ).toBeVisible();
}
async function canvasMenu(page: Page) {
  await page.locator(".board-viewport").evaluate((el) => {
    el.scrollTop += 700;
  });
  await page.locator(".board-viewport").evaluate((el) => {
    const box = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: box.right - 20,
        clientY: box.top + 20,
      }),
    );
  });
}

test("notes edit inline on double-click and save without a popup", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Autosaved while typing");
  await saved(page);
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  await expect(page.locator(".board-inline-editor")).toHaveCount(0);
  await page.locator(".board-card-content").click();
  await expect(page.locator(".board-inline-editor")).toHaveCount(0);
  await page.locator(".board-card-content").dblclick();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveText(
    "Autosaved while typing",
  );
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Changed with a double click");
  await saved(page);
  await page.reload();
  await expect(
    page.locator(".board-card-content"),
  ).toContainText(
    "Changed with a double click",
  );
});

test("context menu changes strip and note colors independently", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Color note");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  const card = page.locator(".board-card");
  await card.click({ button: "right", position: { x: 12, y: 12 } });
  await page
    .getByRole("menuitem", { name: "Change top strip", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Rose top strip", exact: true })
    .click();
  await card.click({ button: "right", position: { x: 12, y: 12 } });
  await page
    .getByRole("menuitem", { name: "Change card background", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Blue card background", exact: true })
    .click();
  await saved(page);
  await page.reload();
  await expect(card).toHaveCSS("background-color", "rgb(227, 239, 250)");
  // The strip color shows as the card's left edge.
  await expect(card).toHaveCSS("border-left-color", "rgb(212, 141, 153)");
});

test("notes stay compact, drag from their surface, and show their creator in the menu", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Compact idea");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  const note = page.locator(".board-card-note");
  await expect(note.locator(".board-card-header")).toHaveCount(0);
  await expect(note.locator(".board-card-actions")).toHaveCount(0);
  const before = await note.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  const box = (await note.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 55, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => note.evaluate((el) => ({ left: el.style.left, top: el.style.top }))).not.toEqual(before);
  await note.click({ button: "right", position: { x: 15, y: 15 } });
  await expect(page.locator(".board-menu-info")).toContainText("Created by");
  await expect(page.locator(".board-menu-info")).toContainText("Demo");
  await expect(page.getByRole("menuitem", { name: "Move to trash", exact: true })).toBeVisible();
});

test("links and images use the same compact surface controls as notes", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  // A new link card asks only for the link; title and description come from the page.
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Link", exact: true }).fill("https://example.com");
  await page.getByRole("button", { name: "Save card" }).click();
  const link = page.locator("article.board-card-link");
  const before = await link.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + 65, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => link.evaluate((el) => ({ left: el.style.left, top: el.style.top }))).not.toEqual(before);
  await link.click({ button: "right", position: { x: 12, y: 12 } });
  await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Change card background", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Mood frame");
  await page.getByRole("button", { name: "Save card" }).click();
  for (const kind of ["link", "image"]) {
    const card = page.locator(`.board-card-${kind}`);
    await expect(card.locator(".board-card-header")).toHaveCount(0);
    await expect(card.locator(".board-card-actions")).toHaveCount(0);
    await expect(card.getByRole("button", { name: /^Resize / })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Storyboard", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Scene", exact: true })).toHaveCount(0);
});

test("Space and drag pans the canvas without moving cards", async ({ page, isMobile }) => {
  test.skip(isMobile, "Space-hand navigation is a keyboard and pointer interaction.");
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Pan around me");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  const viewport = page.locator(".board-viewport");
  await viewport.evaluate((el) => {
    el.scrollLeft = 80;
    el.scrollTop = 80;
  });
  const note = page.locator(".board-card-note");
  const notePosition = await note.evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  const before = await viewport.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  const box = (await viewport.boundingBox())!;
  await page.keyboard.down("Space");
  // Start mid-canvas, clear of the minimap in the corner.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 60, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const after = await viewport.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  // With the full-width canvas there may be no horizontal overflow to pan into.
  expect(after.left).toBeGreaterThanOrEqual(before.left);
  expect(after.top).toBeGreaterThan(before.top);
  expect(await note.evaluate((el) => ({ left: el.style.left, top: el.style.top }))).toEqual(notePosition);
});

test("canvas menu creates cards, selects all, undoes and saves board background", async ({
  page,
}) => {
  await create(page);
  for (const name of ["New note", "New link", "New to-do", "New line"]) {
    await canvasMenu(page);
    if (name === "New note") await page.getByRole("menuitem", { name: "New note here" }).click();
    else {
      await page.getByRole("menuitem", { name: "Add…", exact: true }).click();
      await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
    }
    if (name === "New note")
      await page.getByLabel("Notes", { exact: true }).press("Escape");
    else if (name !== "New line")
      await page.getByRole("button", { name: "Save card" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await canvasMenu(page);
  await page.getByRole("menuitem", { name: /^Select all/ }).click();
  await expect(page.locator('.board-card[data-selected="true"]')).toHaveCount(
    4,
  );
  // Backgrounds are visual swatches in the canvas panel, opened from the menu.
  await canvasMenu(page);
  await page.getByRole("menuitem", { name: "Background, grid and rulers…", exact: true }).click();
  await page.getByRole("radio", { name: "Paper", exact: true }).click();
  await expect(page.locator(".board-viewport")).toHaveClass(/board-bg-paper/);
  await canvasMenu(page);
  await page.getByRole("menuitem", { name: /^Undo/ }).click();
  await expect(page.locator(".board-viewport")).toHaveClass(/board-bg-default/);
  await canvasMenu(page);
  await page.getByRole("menuitem", { name: "Background, grid and rulers…", exact: true }).click();
  await page.getByRole("radio", { name: "Slate", exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.locator(".board-viewport")).toHaveClass(/board-bg-slate/);
});

test("cursor-centered scroll zoom, controls and fit board work", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  const vp = page.locator(".board-viewport");
  const box = (await vp.boundingBox())!;
  await vp.dispatchEvent("wheel", {
    ctrlKey: true,
    deltaY: -100,
    clientX: box.x + 80,
    clientY: box.y + 70,
  });
  await expect(page.getByRole("button", { name: "Reset zoom" })).not.toHaveText(
    "100%",
  );
  const after = await vp.evaluate((el) => el.scrollLeft);
  expect(after).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "100%",
  );
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "90%",
  );
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "80%",
  );
  await page.getByRole("button", { name: "Fit board", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).not.toHaveText(
    "80%",
  );
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await vp.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const touches = (distance: number) => [
      new Touch({
        identifier: 1,
        target: el,
        clientX: rect.left + el.clientWidth / 2 - distance / 2,
        clientY: rect.top + 80,
      }),
      new Touch({
        identifier: 2,
        target: el,
        clientX: rect.left + el.clientWidth / 2 + distance / 2,
        clientY: rect.top + 80,
      }),
    ];
    el.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: touches(100),
        bubbles: true,
        cancelable: true,
      }),
    );
    el.dispatchEvent(
      new TouchEvent("touchmove", {
        touches: touches(160),
        bubbles: true,
        cancelable: true,
      }),
    );
    el.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "160%",
  );
});

test("canvas panel switches grid, rulers and snapping and remembers them", async ({ page, isMobile }) => {
  test.skip(isMobile, "Covered on desktop; the panel is a bottom sheet on phones.");
  await create(page);
  await page.evaluate(() => localStorage.removeItem("mypisara:canvas"));
  await page.reload();
  const viewport = page.locator(".board-viewport");
  await expect(viewport).not.toHaveClass(/board-grid-off/);
  await page.getByRole("button", { name: "Canvas settings" }).click();
  await page.getByRole("switch", { name: /Grid/ }).click();
  await expect(viewport).toHaveClass(/board-grid-off/);
  await page.getByRole("switch", { name: /Rulers/ }).click();
  await expect(page.locator(".canvas-rulers")).toHaveCount(1);
  await page.getByRole("switch", { name: /Snapping/ }).click();
  await expect(page.getByRole("switch", { name: /Snapping/ })).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(viewport).toHaveClass(/board-grid-off/);
  await expect(page.locator(".canvas-rulers")).toHaveCount(1);
});
