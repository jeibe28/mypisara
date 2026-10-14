import { test, expect, type Page } from "@playwright/test";

const STORAGE = "mypisara.boards.demo.v1";
async function create(page: Page, title = "Polish board") {
  await page.goto("/demo");
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await page.getByLabel("Board name").fill(title);
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
}
async function addNote(page: Page, text: string) {
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill(text);
  await page.getByLabel("Notes", { exact: true }).press("Escape");
}
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
function savedCards(page: Page, title: string) {
  return page.evaluate(([key, name]) =>
    JSON.parse(localStorage.getItem(key)!).find((b: { title: string }) => b.title === name).cards, [STORAGE, title] as const);
}

test.skip(({ isMobile }) => isMobile, "Pointer drag flows are covered on desktop.");

test("new cards avoid overlapping and columns stack dropped cards in order", async ({ page }) => {
  await create(page);
  await addNote(page, "First");
  await addNote(page, "Second");
  await addNote(page, "Third");
  const boxes = await page.locator("article.board-card-note").evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).map(({ x, y, width, height }) => ({ x, y, width, height })));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
  await page.getByRole("button", { name: "Column", exact: true }).click();
  await page.getByLabel("Column title").fill("Shot list");
  await page.getByLabel("Column title").press("Enter");
  const column = page.locator("article.board-card-column");
  await expect(column).toContainText("Drag cards here to stack them");
  for (const text of ["First", "Second"]) {
    const card = page.locator("article.board-card-note", { hasText: text });
    await card.scrollIntoViewIfNeeded();
    const from = (await card.boundingBox())!;
    const to = (await column.boundingBox())!;
    await dragTo(page, { x: from.x + 30, y: from.y + 12 }, { x: to.x + 60, y: to.y + to.height - 20 });
  }
  await expect(column.locator(".board-column-count")).toHaveText("2");
  // Drop "Third" above "First" to reorder within the column.
  const third = page.locator("article.board-card-note", { hasText: "Third" });
  const first = page.locator("article.board-card-note", { hasText: "First" });
  await third.scrollIntoViewIfNeeded();
  const from = (await third.boundingBox())!;
  const target = (await first.boundingBox())!;
  await dragTo(page, { x: from.x + 30, y: from.y + 12 }, { x: target.x + 60, y: target.y + 4 });
  await expect(column.locator(".board-column-count")).toHaveText("3");
  await saved(page);
  const cards = await savedCards(page, "Polish board");
  const col = cards.find((c: { kind: string }) => c.kind === "column");
  const stacked = cards.filter((c: { parent_id: string }) => c.parent_id === col.id)
    .sort((a: { y: number }, b: { y: number }) => a.y - b.y);
  expect(stacked.map((c: { body: string }) => c.body)).toEqual(["Third", "First", "Second"]);
  expect(new Set(stacked.map((c: { x: number }) => c.x)).size).toBe(1);
  expect(stacked[1].y).toBeGreaterThan(stacked[0].y);
  // Moving the column carries its cards along.
  await page.getByLabel("Board canvas").click({ position: { x: 5, y: 5 } });
  const header = column.locator(".board-column-header strong");
  const h = (await header.boundingBox())!;
  await dragTo(page, { x: h.x + 10, y: h.y + 5 }, { x: h.x + 90, y: h.y + 45 });
  await saved(page);
  const moved = await savedCards(page, "Polish board");
  const movedCol = moved.find((c: { kind: string }) => c.kind === "column");
  for (const child of moved.filter((c: { parent_id: string }) => c.parent_id === movedCol.id))
    expect(child.x).toBe(movedCol.x + 12);
});

test("dragging cards onto Trash deletes them and Board trash restores them", async ({ page }) => {
  await create(page);
  await addNote(page, "Throw away");
  const card = page.locator("article.board-card-note", { hasText: "Throw away" });
  const trash = page.getByRole("button", { name: /^Trash/ });
  const from = (await card.boundingBox())!;
  const to = (await trash.boundingBox())!;
  await dragTo(page, { x: from.x + 30, y: from.y + 12 }, { x: to.x + to.width / 2, y: to.y + to.height / 2 });
  await expect(page.locator("article.board-card-note")).toHaveCount(0);
  await expect(trash).toContainText("1");
  await trash.click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("article.board-card-note", { hasText: "Throw away" })).toBeVisible();
});

test("the Board tool creates a nested board with breadcrumbs back to the parent", async ({ page }) => {
  await create(page, "Campaign");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Moodboard");
  await page.getByRole("button", { name: "Save card" }).click();
  await saved(page);
  await page.getByRole("button", { name: "Open Moodboard" }).click();
  await expect(page.getByRole("heading", { name: "Moodboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Board path" })).toContainText("Campaign");
  await addNote(page, "Inside the moodboard");
  await saved(page);
  await page.getByRole("button", { name: "Back to Campaign" }).click();
  await expect(page.getByRole("heading", { name: "Campaign" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Board path" })).toHaveCount(0);
  await expect(page.locator("article.board-card-board")).toContainText("1 card");
  await page.getByRole("button", { name: "Back to boards" }).click();
  await expect(page.locator(".board-preview")).toHaveCount(2);
  await expect(page.locator(".board-preview", { hasText: "Moodboard" }).locator("svg rect")).toHaveCount(1);
});

test("multi-selection aligns, duplicates, copies and pastes as a group", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await create(page);
  await page.evaluate((key) => {
    const boards = JSON.parse(localStorage.getItem(key)!);
    const template = { title: "", body: "", body_html: "", created_by_id: "", created_by_name: "", parent_id: null, collapsed: false, target_board_id: null, file_name: "", file_type: "", file_size: 0, caption: "", heading_size: "large", heading_align: "left", link_show_image: true, link_show_description: true, link_preview: null, image_fit: "contain", image_position_x: 50, image_position_y: 50, color_value: "#9cbc83", height: null, color: "sage", strip_color: null, background_color: null, line_color: "#9cbc83", line_weight: 3, line_dashed: false, line_start_arrow: false, line_end_arrow: false, line_start_connection: null, line_end_connection: null, line_start_x: null, line_start_y: null, line_end_x: null, line_end_y: null, line_bend: null, url: "", image: "", duration: "", dialogue: "", tasks: [], kind: "note", width: 270 };
    boards[0].cards = [
      { ...template, id: crypto.randomUUID(), body: "Alpha", x: 40, y: 40 },
      { ...template, id: crypto.randomUUID(), body: "Beta", x: 380, y: 120 },
    ];
    localStorage.setItem(key, JSON.stringify(boards));
  }, STORAGE);
  await page.reload();
  await page.getByLabel("Board canvas").focus();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByRole("toolbar", { name: "Selection options" })).toContainText("2 selected");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Align top" }).click();
  await saved(page);
  let cards = await savedCards(page, "Polish board");
  expect(cards.map((c: { y: number }) => c.y)).toEqual([40, 40]);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator("article.board-card-note")).toHaveCount(4);
  await page.keyboard.press("ControlOrMeta+c");
  await page.getByLabel("Board canvas").click({ position: { x: 600, y: 420 } });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator("article.board-card-note")).toHaveCount(6);
  await saved(page);
  cards = await savedCards(page, "Polish board");
  expect(new Set(cards.map((c: { id: string }) => c.id)).size).toBe(6);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "Selection options" })).toHaveCount(0);
});

test("single cards get color swatches and quick-key shortcuts add cards", async ({ page }) => {
  await create(page);
  await addNote(page, "Paint me");
  await page.locator("article.board-card-note").click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Sand card background" }).click();
  await expect(page.locator("article.board-card-note")).toHaveCSS("background-color", "rgb(248, 237, 214)");
  await page.keyboard.press("Escape");
  await page.getByLabel("Board canvas").focus();
  await page.keyboard.press("t");
  await expect(page.locator("article.board-card-checklist")).toHaveCount(1);
  await page.getByLabel("New checklist item").press("Escape");
  await page.getByLabel("Board canvas").focus();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.locator("article.board-card-note")).toHaveCount(1);
});

test("the selection box is drawn exactly where the pointer drags", async ({ page }) => {
  await create(page);
  await addNote(page, "Pick me");
  const viewport = (await page.locator(".board-viewport").boundingBox())!;
  const start = { x: viewport.x + 300, y: viewport.y + 200 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 250, start.y + 150, { steps: 6 });
  const box = (await page.locator(".board-marquee").boundingBox())!;
  expect(Math.abs(box.x - start.x)).toBeLessThan(2);
  expect(Math.abs(box.y - start.y)).toBeLessThan(2);
  expect(Math.abs(box.width - 250)).toBeLessThan(2);
  await page.mouse.up();
});

test("the dashed group box surrounds the selected cards", async ({ page }) => {
  await create(page);
  await addNote(page, "One");
  await addNote(page, "Two");
  await page.getByLabel("Board canvas").focus();
  await page.keyboard.press("ControlOrMeta+a");
  const bounds = (await page.locator(".board-group-bounds").boundingBox())!;
  for (const text of ["One", "Two"]) {
    const card = (await page.locator("article.board-card-note", { hasText: text }).boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(bounds.x);
    expect(card.y).toBeGreaterThanOrEqual(bounds.y);
    expect(card.x + card.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(card.y + card.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
});

test("right-click menus close when another card or the canvas is pressed", async ({ page }) => {
  await create(page);
  await addNote(page, "First");
  await addNote(page, "Second");
  const first = page.locator("article.board-card-note", { hasText: "First" });
  const second = page.locator("article.board-card-note", { hasText: "Second" });
  await first.click({ button: "right", position: { x: 20, y: 20 } });
  await expect(page.getByRole("menu")).toBeVisible();
  await second.click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await first.click({ button: "right", position: { x: 20, y: 20 } });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByLabel("Board canvas").click({ position: { x: 500, y: 300 } });
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("the side panel edits the selected line and card", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Card options" });
  await expect(panel.getByRole("toolbar", { name: "Line style" })).toBeVisible();
  await panel.getByRole("button", { name: "More options" }).click();
  await panel.getByLabel("Line label", { exact: true }).fill("Next step");
  await panel.getByRole("button", { name: "Dashed", exact: true }).click();
  await panel.getByRole("button", { name: "End arrow", exact: true }).click();
  await panel.getByLabel("Line weight").selectOption("4");
  await expect(page.getByRole("button", { name: "Next step", exact: true })).toBeVisible();
  await expect(page.locator(".board-line-visible")).toHaveAttribute("stroke-dasharray", "10 7");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await page.getByLabel("Heading text").press("Enter");
  await panel.getByRole("button", { name: "More options" }).click();
  await panel.getByLabel("Card title").fill("Renamed in panel");
  await expect(page.locator("article.board-card-group h2")).toHaveText("Renamed in panel");
  await saved(page);
  const cards = await savedCards(page, "Polish board");
  expect(cards.find((c: { kind: string }) => c.kind === "line")).toMatchObject({ title: "Next step", line_dashed: true, line_end_arrow: true, line_weight: 4 });
});
