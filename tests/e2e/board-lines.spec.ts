import { test, expect, type Page } from "@playwright/test";

async function create(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await page.getByLabel("Board name").fill("Connected lines");
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  for (const title of ["Source", "Destination"]) {
    await page.getByRole("button", { name: "Note", exact: true }).click();
    await page.getByLabel("Notes", { exact: true }).fill(title);
    await page.getByLabel("Notes", { exact: true }).press("Escape");
  }
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
  await page.evaluate(() => {
    const key = "mypisara.boards.demo.v1";
    const boards = JSON.parse(localStorage.getItem(key)!);
    const board = boards[0];
    Object.assign(board.cards[0], { x: 80, y: 100, width: 270, height: 180 });
    Object.assign(board.cards[1], { x: 650, y: 320, width: 270, height: 180 });
    Object.assign(board.cards[2], {
      x: 390,
      y: 180,
      line_start_x: 390,
      line_start_y: 190,
      line_end_x: 620,
      line_end_y: 390,
    });
    localStorage.setItem(key, JSON.stringify(boards));
  });
  await page.reload();
}

test("lines snap, follow cards, curve, reset, label, and expose style controls", async ({ page, isMobile }) => {
  test.skip(isMobile, "Precise mouse interaction is covered in the desktop project.");
  await create(page);
  const start = page.getByRole("button", { name: "Move line start" });
  const source = page.locator('[data-card-id]').filter({ hasText: "Source" });
  const sourceBox = (await source.boundingBox())!;
  const startBox = (await start.boundingBox())!;
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width, sourceBox.y + sourceBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!)[0]);
  expect(saved.cards.find((card: { kind: string }) => card.kind === "line").line_start_connection).toMatchObject({
    card_id: saved.cards[0].id,
    edge: "right",
  });

  const path = page.locator(".board-line-visible");
  const beforeMove = await path.getAttribute("d");
  const mover = source;
  const moverBox = (await mover.boundingBox())!;
  await page.mouse.move(moverBox.x + 8, moverBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(moverBox.x + 108, moverBox.y + 68, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => path.getAttribute("d")).not.toBe(beforeMove);

  const bend = page.getByRole("button", { name: "Curve line" });
  const bendBox = (await bend.boundingBox())!;
  await page.mouse.move(bendBox.x + bendBox.width / 2, bendBox.y + bendBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(bendBox.x + bendBox.width / 2, bendBox.y - 90, { steps: 8 });
  await page.mouse.up();
  await expect(path).toHaveAttribute("d", / Q /);

  await page.locator(".board-line-hit").dispatchEvent("click");
  await expect(page.getByRole("toolbar", { name: "Line style" })).toBeVisible();
  await page.getByLabel("Line color #82b2d3").click();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByLabel("Line weight").selectOption("6");
  await page.getByRole("button", { name: "Dashed", exact: true }).click();
  await page.getByRole("button", { name: "End arrow", exact: true }).click();
  await expect(page.locator("marker")).toHaveAttribute("markerUnits", "userSpaceOnUse");
  expect(Number(await page.locator("marker").getAttribute("markerWidth"))).toBeGreaterThanOrEqual(14);
  await page.getByLabel("Line label", { exact: true }).fill("Needs approval");
  await page.getByLabel("Line label", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Needs approval", exact: true })).toBeVisible();
  await page.locator(".board-line-hit").dispatchEvent("dblclick");
  await expect(path).not.toHaveAttribute("d", / Q /);
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!)[0]);
  expect(saved.cards.find((card: { kind: string }) => card.kind === "line").line_bend).toBeNull();
  expect(saved.cards.find((card: { kind: string }) => card.kind === "line")).toMatchObject({
    title: "Needs approval",
    line_color: "#82b2d3",
    line_weight: 6,
    line_dashed: true,
    line_end_arrow: true,
  });
});

test("the curve handle follows the pointer on the line and moves in any direction", async ({ page, isMobile }) => {
  test.skip(isMobile, "Precise mouse interaction is covered in the desktop project.");
  await create(page);
  await page.locator(".board-line-hit").dispatchEvent("click");
  const handle = page.getByRole("button", { name: "Curve line" });
  const centre = async () => {
    const box = (await handle.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const dragTo = async (to: { x: number; y: number }) => {
    const from = await centre();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  };

  const start = await centre();
  await dragTo({ x: start.x + 20, y: start.y - 90 });
  const first = await centre();
  expect(Math.abs(first.x - (start.x + 20))).toBeLessThan(3);
  expect(Math.abs(first.y - (start.y - 90))).toBeLessThan(3);

  // Sideways movement is allowed too, so the peak can lean toward one end.
  await dragTo({ x: first.x + 80, y: first.y });
  const second = await centre();
  expect(Math.abs(second.x - (first.x + 80))).toBeLessThan(3);
  await expect(page.locator(".board-line-visible")).toHaveAttribute("d", / Q /);
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
  const line = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!)[0].cards.find((c: { kind: string }) => c.kind === "line"));
  expect(line.line_shift).not.toBe(0);
  expect(line.line_shift).not.toBeNull();
});

test("line ends snap over cards, and Alt places them freely", async ({ page, isMobile }) => {
  test.skip(isMobile, "Precise mouse interaction is covered in the desktop project.");
  await create(page);
  await page.locator(".board-line-hit").dispatchEvent("click");
  const source = (await page.locator(".board-card-note").first().boundingBox())!;
  const target = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const startHandle = page.getByRole("button", { name: "Move line start" });
  async function dragStartTo(point: { x: number; y: number }, alt: boolean) {
    const box = (await startHandle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(point.x, point.y, { steps: 10 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
    await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
    return page.evaluate(() =>
      JSON.parse(localStorage.getItem("mypisara.boards.demo.v1")!)[0].cards.find((c: { kind: string }) => c.kind === "line").line_start_connection);
  }
  expect(await dragStartTo(target, true)).toBeNull();
  expect(await dragStartTo(target, false)).toMatchObject({ edge: expect.any(String) });
});
