import { test, expect, type Page } from "@playwright/test";

async function create(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await page.getByLabel("Board name").fill("Canvas tools");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Canvas tools" }),
  ).toBeVisible();
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved/ }),
  ).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!)[0],
  );
}
async function dropTool(page: Page, kind: string, x = 110, y = 100) {
  const transfer = await page.evaluateHandle((kind) => {
    const dt = new DataTransfer();
    dt.setData("application/x-mypisara-card-kind", kind);
    return dt;
  }, kind);
  const viewport = page.locator(".board-viewport");
  const box = (await viewport.boundingBox())!;
  await viewport.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: box.x + x,
    clientY: box.y + y,
  });
  await transfer.dispose();
}

test("drops notes, links, to-dos and lines at canvas coordinates", async ({
  page,
  isMobile,
}) => {
  await create(page);
  if (!isMobile) {
    await page
      .getByRole("button", { name: "Note", exact: true })
      .dragTo(page.locator(".board-viewport"), {
        targetPosition: { x: 110, y: 100 },
      });
  } else await dropTool(page, "note");
  await page.getByLabel("Notes", { exact: true }).fill("Dropped note");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  await saved(page);
  expect((await stored(page)).cards[0]).toMatchObject({ x: 110, y: 100 });
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  const dropOffset = await page
    .locator(".board-viewport")
    .evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  await dropTool(page, "link", 180, 90);
  await page.getByRole("textbox", { name: "Link", exact: true }).fill("https://example.com/reference");
  await page.getByRole("textbox", { name: "Link", exact: true }).press("Escape");
  await dropTool(page, "checklist", 150, 140);
  // To-do lists are just the list: no title field.
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "New checklist item" })
    .fill("Mix audio");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save card" }).click();
  await dropTool(page, "line", 80, 250);
  await saved(page);
  const board = await stored(page);
  expect(board.cards.map((c: { kind: string }) => c.kind)).toEqual([
    "note",
    "link",
    "checklist",
    "line",
  ]);
  expect(Math.abs(board.cards[1].x - (180 + dropOffset.x) / 0.9)).toBeLessThanOrEqual(1);
  expect(Math.abs(board.cards[1].y - (90 + dropOffset.y) / 0.9)).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(page.locator(".board-line-art")).toBeVisible();
});

test("image drops upload references and report unsupported files", async ({
  page,
}) => {
  await create(page);
  const transfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    dt.items.add(new File([bytes], "frame.png", { type: "image/png" }));
    dt.items.add(new File(["bad"], "script.svg", { type: "image/svg+xml" }));
    return dt;
  });
  const vp = page.locator(".board-viewport");
  const box = (await vp.boundingBox())!;
  await vp.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: box.x + 70,
    clientY: box.y + 80,
  });
  // Cards are named after the file without its extension.
  await expect(page.getByAltText("frame")).toBeVisible();
  // An unsupported file stays on the canvas as an error card with the reason and a way out.
  const failed = page.locator(".board-pending.is-error");
  await expect(failed).toContainText("script.svg");
  await expect(failed.getByRole("button", { name: "Retry" })).toBeVisible();
  await saved(page);
  expect((await stored(page)).cards).toHaveLength(1);
  await page.reload();
  await expect(page.getByAltText("frame")).toBeVisible();
});

test("context menu copies, cuts, duplicates, layers and restores trash", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Main idea");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  const card = page.locator(".board-card").first();
  async function action(name: string) {
    await card.focus();
    await card.press("Shift+F10");
    await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
  }
  await action("Duplicate");
  await expect(page.locator(".board-card")).toHaveCount(2);
  await saved(page);
  const original = (await stored(page)).cards[0].id;
  await action("Bring to front");
  await saved(page);
  expect((await stored(page)).cards.at(-1).id).toBe(original);
  await page
    .locator(".board-card")
    .last()
    .click({ button: "right", position: { x: 12, y: 12 } });
  await page
    .getByRole("menuitem", { name: "Send to back", exact: true })
    .click();
  await saved(page);
  expect((await stored(page)).cards[0].id).toBe(original);
  await action("Copy");
  await page
    .locator(".board-viewport")
    .click({ button: "right", position: { x: 20, y: 20 } });
  await page.getByRole("menuitem", { name: /^Paste/ }).click();
  await expect(page.locator(".board-card")).toHaveCount(3);
  await action("Cut");
  await expect(page.locator(".board-card")).toHaveCount(2);
  await action("Move to trash");
  await saved(page);
  await expect(page.locator(".board-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: /^Trash/ }).click();
  await expect(page.locator(".board-trash-list > div")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Restore", exact: true })
    .first()
    .click();
  await expect(page.locator(".board-trash-list > div")).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".board-card")).toHaveCount(2);
  await saved(page);
});

test("resizes width and height independently and preserves them after refresh", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Editing notes\n".repeat(4));
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  const handle = page.getByRole("button", {
    name: "Resize Note",
    exact: true,
  });
  await handle.press("ArrowDown");
  await saved(page);
  const first = (await stored(page)).cards[0];
  expect(first.height).toBeGreaterThan(100);
  expect(first.width).toBe(270);
  await handle.press("ArrowRight");
  await saved(page);
  const second = (await stored(page)).cards[0];
  expect(second.width).toBe(290);
  expect(second.height).toBe(first.height);
  // A pointer resize with vertical movement changes only the height.
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 50);
  await page.mouse.up();
  await saved(page);
  const third = (await stored(page)).cards[0];
  expect(third.width).toBe(290);
  expect(third.height).toBeCloseTo(first.height + 50);
  await page.reload();
  const rect = await page.locator(".board-card").boundingBox();
  expect(rect!.height).toBeCloseTo(third.height);
  await page.screenshot({
    path: `/private/tmp/mypisara-canvas-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("selected cards rise above overlapping cards without changing saved layers", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Back note");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  await saved(page);
  await page.evaluate(() => {
    const boards = JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!);
    const card = boards[0].cards[0];
    card.x = 100; card.y = 100;
    boards[0].cards.push({ ...card, id: crypto.randomUUID(), body: "Front note", x: 150 });
    localStorage.setItem("mypisara.boards.demo.v1", JSON.stringify(boards));
  });
  await page.reload();
  const cards = page.locator(".board-card");
  const order = (await stored(page)).cards.map((card: { id: string }) => card.id);
  await cards.first().focus();
  expect(await cards.first().evaluate((el) => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(
    await cards.last().evaluate((el) => Number(getComputedStyle(el).zIndex)),
  );
  await cards.last().focus();
  expect(await cards.last().evaluate((el) => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(
    await cards.first().evaluate((el) => Number(getComputedStyle(el).zIndex)),
  );
  expect((await stored(page)).cards.map((card: { id: string }) => card.id)).toEqual(order);
});

test("resized image cards keep captions and long links accessible", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  await saved(page);
  await page.evaluate(() => {
    const boards = JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!);
    Object.assign(boards[0].cards[0], {
      kind: "image", title: "Reference image", x: 80, y: 80, width: 220, height: 120,
      image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=",
      caption: "caption".repeat(60), url: "https://example.com/" + "reference".repeat(40),
    });
    localStorage.setItem("mypisara.boards.demo.v1", JSON.stringify(boards));
  });
  await page.reload();
  // An image card is just its picture: no card chrome, no scrolling, nothing hidden behind a scrollbar.
  const card = page.locator("article.board-card-image");
  await expect(card).toHaveCSS("max-height", "none");
  await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(card.locator(".board-card-scroll")).toHaveCSS("overflow-y", "visible");
  await expect(card.locator("h3")).toHaveCount(0);
  await expect(page.getByAltText("Reference image")).toHaveAttribute("draggable", "false");
  // The stale 120px height was dropped, so the picture fills its width. A caption you wrote stays
  // under it, while the reference link is kept on the card but not drawn over the picture.
  await expect(card.locator("img")).toHaveCSS("height", "220px");
  await expect(card.locator(".board-card-caption")).toContainText("caption");
  await expect(card.locator("a.board-card-link")).toHaveCount(0);
});
