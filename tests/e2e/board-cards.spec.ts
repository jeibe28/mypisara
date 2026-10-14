import { test, expect, type Page } from "@playwright/test";

async function create(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await page.getByLabel("Board name").fill("Creative workspace");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Creative workspace" })).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
}

test("links load previews, toggle sections, and move without creating copies", async ({ page }) => {
  await page.route("**/api/boards/link-preview", async (route) => {
    const { url } = route.request().postDataJSON();
    await route.fulfill({ json: { url, title: "Design reference", description: "A collection of visual ideas.", image: "https://example.com/preview.png", site_name: "Example" } });
  });
  await page.route("https://example.com/preview.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=", "base64") }));
  await create(page);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.getByRole("textbox", { name: "Link", exact: true }).fill("https://example.com/reference");
  await page.getByRole("textbox", { name: "Link", exact: true }).press("Enter");
  const card = page.locator("article.board-card-link");
  await expect(card.getByRole("heading", { name: "Design reference" })).toBeVisible();
  await expect(card.locator(".board-link-thumbnail")).toBeVisible();
  await expect(card).toContainText("A collection of visual ideas.");
  await page.screenshot({ path: `/private/tmp/mypisara-link-preview-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Description", exact: true }).click();
  await expect(card.locator(".board-link-description")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview image", exact: true }).click();
  await expect(card.locator(".board-link-thumbnail")).toHaveCount(0);
  const before = await card.evaluate((el) => ({ x: el.style.left, y: el.style.top }));
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 18);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.move(box.x + 100, box.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("article.board-card")).toHaveCount(1);
  expect(await card.evaluate((el) => ({ x: el.style.left, y: el.style.top }))).not.toEqual(before);
  const anchor = card.locator("a");
  await expect(anchor).toHaveAttribute("draggable", "false");
  const prevented = await anchor.evaluate((el) => !el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })));
  expect(prevented).toBe(true);
  await saved(page);
  await page.reload();
  await expect(card).toContainText("Design reference");
  await expect(card.locator(".board-link-thumbnail")).toHaveCount(0);
});

test("headings are freestanding, editable, resizable and preserve formatting", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await page.getByLabel("Heading text").fill("Creative direction");
  // Enter adds a line in a heading; Escape finishes.
  await page.getByLabel("Heading text").press("Escape");
  const heading = page.locator("article.board-card-group");
  await expect(heading).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(heading).toHaveCSS("border-top-width", "0px");
  await page.getByRole("button", { name: "More options" }).click();
  await page.locator(".board-inspector").getByRole("button", { name: "Heading", exact: true }).click();
  await page.getByRole("button", { name: "Align heading center" }).click();
  await expect(heading.locator("h2")).toHaveCSS("text-align", "center");
  await expect(heading.locator("h2")).toHaveCSS("font-size", "19px");
  await heading.dblclick();
  await page.getByLabel("Heading text").fill("References");
  await page.getByLabel("Heading text").press("Escape");
  // A heading's width fits its text; the arrow key then nudges it wider by 20px.
  const fitted = await heading.evaluate((el) => (el as HTMLElement).offsetWidth);
  await page.getByRole("button", { name: "Resize References", exact: true }).press("ArrowRight");
  await saved(page);
  await page.reload();
  await expect(heading).toContainText("References");
  await expect(heading.locator("h2")).toHaveCSS("text-align", "center");
  expect(await heading.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(fitted + 20);
  await page.screenshot({ path: `/private/tmp/mypisara-heading-${test.info().project.name}.png`, fullPage: true });
});

test("to-dos edit directly, add with Enter, indent, reorder, assign and persist", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "To-do", exact: true }).click();
  await page.getByLabel("New checklist item").fill("Review visuals");
  await page.getByLabel("New checklist item").press("Enter");
  await page.getByLabel("Task 1", { exact: true }).press("Enter");
  await page.getByLabel("Task 2", { exact: true }).fill("Export files");
  await page.getByLabel("Task 2", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Save card" }).click();
  await page.getByRole("button", { name: "Task 2 options" }).click();
  await page.getByLabel("Task 2 assignee").fill("Alex");
  await page.getByLabel("Task 2 due date").fill("2026-10-20");
  await page.getByRole("button", { name: "Move task 2 up", exact: true }).click();
  await expect(page.getByLabel("Task 1", { exact: true })).toHaveValue("Export files");
  await page.getByRole("checkbox", { name: "Export files", exact: true }).check();
  await saved(page);
  const tasks = await page.evaluate(() => JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!)[0].cards[0].tasks);
  expect(tasks[0]).toMatchObject({ text: "Export files", indent: 1, assignee: "Alex", due_date: "2026-10-20", done: true });
  await page.screenshot({ path: `/private/tmp/mypisara-todos-${test.info().project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Export files" })).toBeChecked();
  await page.locator("article.board-card-checklist").focus();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Clear completed" }).click();
  await expect(page.locator(".board-todo-item")).toHaveCount(1);
  await expect(page.getByLabel("Task 1", { exact: true })).toHaveValue("Review visuals");
});

test("holding and dragging notes, images, headings and to-dos only moves the existing cards", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Original note");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  await saved(page);
  await page.evaluate(() => {
    const boards = JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!);
    const base = boards[0].cards[0];
    boards[0].cards = ["note", "image", "group", "checklist"].map((kind, i) => ({
      ...base, id: crypto.randomUUID(), kind, title: `Original ${kind}`, body: "Move this original", x: 40, y: 40 + i * 280,
      image: kind === "image" ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=" : "",
    }));
    localStorage.setItem("mypisara.boards.demo.v1", JSON.stringify(boards));
  });
  await page.reload();
  await expect(page.locator("article.board-card")).toHaveCount(4);
  const ids = await page.locator("article.board-card").evaluateAll((elements) => elements.map((el) => el.getAttribute("data-card-id")));
  for (const kind of ["note", "image", "group", "checklist"]) {
    const card = page.locator(`article.board-card-${kind}`);
    await card.focus();
    await card.scrollIntoViewIfNeeded();
    const before = await card.evaluate((el) => ({ x: el.style.left, y: el.style.top }));
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.move(box.x + 65, box.y + 35, { steps: 6 });
    await page.mouse.up();
    expect(await card.evaluate((el) => ({ x: el.style.left, y: el.style.top }))).not.toEqual(before);
    await expect(page.locator("article.board-card")).toHaveCount(4);
  }
  await saved(page);
  expect(await page.locator("article.board-card").evaluateAll((elements) => elements.map((el) => el.getAttribute("data-card-id")))).toEqual(ids);
});

test("Fit board handles collapsed columns and hidden children", async ({ page }) => {
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Hidden child");
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  await page.getByRole("button", { name: "Column", exact: true }).click();
  await page.getByLabel("Column title").press("Enter");
  await saved(page);
  await page.evaluate(() => {
    const boards = JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!);
    const [child, column] = boards[0].cards;
    Object.assign(child, { parent_id: column.id, x: 2000, y: 2000 });
    Object.assign(column, { x: 40, y: 40, collapsed: true });
    localStorage.setItem("mypisara.boards.demo.v1", JSON.stringify(boards));
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.reload();
  await expect(page.locator("article.board-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Fit board", exact: true }).click();
  const zoom = await page.getByRole("button", { name: "Reset zoom" }).textContent();
  expect(parseFloat(zoom!)).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test("audio cards have a full-width seek bar that scrubs, plus play and mute", async ({ page, isMobile }) => {
  test.skip(isMobile, "Pointer scrubbing is covered on desktop.");
  // 20 seconds of silent 8-bit mono WAV.
  const samples = 8000 * 20;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(samples, 40);
  await create(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Notes", { exact: true }).press("Escape");
  await saved(page);
  await page.evaluate((data) => {
    const boards = JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!);
    Object.assign(boards[0].cards[0], {
      kind: "file", title: "take", image: `data:audio/wav;base64,${data}`, file_name: "take.wav", file_type: "audio/wav", file_size: 160044,
    });
    localStorage.setItem("mypisara.boards.demo.v1", JSON.stringify(boards));
  }, wav.toString("base64"));
  await page.reload();
  const audio = page.locator(".board-audio-player audio");
  const seek = page.getByRole("slider", { name: "Seek" });
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.duration)).toBe(20);
  const box = (await seek.boundingBox())!;
  expect(box.width).toBeGreaterThan(150);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => Math.round(a.currentTime))).toBe(10);
  await seek.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBe(0);
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);
  await page.getByRole("button", { name: "Mute" }).click();
  await expect(page.getByRole("button", { name: "Unmute" })).toBeVisible();
});
