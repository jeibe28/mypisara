import { describe, it, expect } from "vitest";
import {
  boardSchema,
  newBoard,
  newCard,
  validBoardImage,
  layerCard,
  trashCard,
  restoreCard,
  cloneCard,
  clampBoardZoom,
  zoomBoardOffset,
  sanitizeBoardRichText,
  cloneCards,
  stackColumns,
  columnInsertion,
  alignCards,
  boardPreview,
  COLUMN_HEADER,
  COLUMN_PADDING,
  COLUMN_GAP,
} from "../src/lib/boards";

describe("board validation", () => {
  it("sanitizes rich note content while keeping safe formatting", () => {
    const html = sanitizeBoardRichText('<h2>Plan</h2><script>alert(1)</script><a href="javascript:bad">link</a><strong>bold</strong>');
    expect(html).toContain("<h2>Plan</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
  });
  it("supports columns, nested boards, media, color cards, and task metadata", () => {
    const board = newBoard("Advanced");
    const column = newCard("column");
    const task = { ...newCard("checklist"), parent_id: column.id, tasks: [{ id: crypto.randomUUID(), text: "Review", done: false, indent: 0, assignee: "Alex", due_date: "2026-10-20" }] };
    const parsed = boardSchema.parse({ ...board, cards: [column, task, newCard("board"), newCard("video"), newCard("file"), newCard("color")] });
    expect(parsed.cards).toHaveLength(6);
    expect(parsed.cards[1].tasks[0]).toMatchObject({ assignee: "Alex", due_date: "2026-10-20" });
  });
  it("creates a blank canvas without storyboard scenes", () => {
    const b = newBoard("Film");
    expect(boardSchema.parse(b).cards).toEqual([]);
    expect(b.scene_order).toEqual([]);
  });
  it("rejects duplicate cards and invalid legacy scene references", () => {
    const b = newBoard("Film");
    const note = newCard("note");
    expect(
      boardSchema.safeParse({ ...b, cards: [note, note] }).success,
    ).toBe(false);
    expect(
      boardSchema.safeParse({
        ...b,
        scene_order: [...b.scene_order, newCard("note").id],
      }).success,
    ).toBe(false);
  });
  it("rejects executable URLs and unbounded coordinates", () => {
    const b = newBoard("Film");
    const c = newCard("link");
    expect(
      boardSchema.safeParse({
        ...b,
        cards: [{ ...c, url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
    expect(
      boardSchema.safeParse({ ...b, cards: [{ ...c, x: Infinity }] }).success,
    ).toBe(false);
    expect(
      boardSchema.safeParse({ ...b, cards: [{ ...c, width: 10 }] }).success,
    ).toBe(false);
  });
  it("restricts private attachments to the owner and rejects SVG and path traversal", () => {
    expect(validBoardImage("board-assets/owner/file.png", "owner")).toBe(true);
    expect(validBoardImage("board-assets/other/file.png", "owner")).toBe(false);
    expect(
      validBoardImage("board-assets/owner/../other/file.png", "owner"),
    ).toBe(false);
    expect(validBoardImage("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(validBoardImage("data:image/png;base64,aGVsbG8=")).toBe(true);
  });
});

describe("canvas editing compatibility", () => {
  it("loads older cards with automatic height and empty trash", () => {
    const board = newBoard("Old board");
    const card = newCard("note");
    const { height, created_by_id, created_by_name, ...oldCard } = card;
    const { trash, ...oldBoard } = board;
    const migrated = boardSchema.parse({ ...oldBoard, cards: [oldCard] });
    expect(migrated.cards[0].height).toBeNull();
    expect(migrated.cards[0].created_by_name).toBe("");
    expect(migrated.trash).toEqual([]);
  });
  it("accepts independent width and height for cards and lines", () => {
    const b = newBoard("Canvas");
    const card = { ...newCard("note"), width: 500, height: 180 };
    expect(boardSchema.parse({ ...b, cards: [card] }).cards[0]).toMatchObject({
      width: 500,
      height: 180,
    });
    expect(
      boardSchema.parse({ ...b, cards: [newCard("line")] }).cards[0].kind,
    ).toBe("line");
  });
  it("migrates old lines and persists connection, curve, and style data", () => {
    const board = newBoard("Connections");
    const note = newCard("note");
    const line = {
      ...newCard("line"),
      title: "Review flow",
      line_color: "#82b2d3",
      line_weight: 6,
      line_dashed: true,
      line_start_arrow: true,
      line_end_arrow: true,
      line_start_connection: {
        card_id: note.id,
        edge: "right" as const,
        offset: 0.5,
      },
      line_bend: 84,
    };
    expect(boardSchema.parse({ ...board, cards: [note, line] }).cards[1]).toMatchObject({
      title: "Review flow",
      line_color: "#82b2d3",
      line_weight: 6,
      line_dashed: true,
      line_start_arrow: true,
      line_end_arrow: true,
      line_bend: 84,
      line_start_connection: { card_id: note.id, edge: "right", offset: 0.5 },
    });
    const legacy = newCard("line");
    const {
      line_color,
      line_weight,
      line_dashed,
      line_start_arrow,
      line_end_arrow,
      line_start_connection,
      line_end_connection,
      line_start_x,
      line_start_y,
      line_end_x,
      line_end_y,
      line_bend,
      ...oldLine
    } = legacy;
    expect(boardSchema.parse({ ...board, cards: [oldLine] }).cards[0]).toMatchObject({
      line_color: "#9cbc83",
      line_weight: 3,
      line_dashed: false,
      line_bend: null,
    });
  });
});

it("layer changes preserve legacy ordering and trash restores cards without ID collisions", () => {
  const first = newCard("note");
  const board = { ...newBoard("Sequence"), cards: [first] };
  const front = layerCard(board, board.cards[0].id, true);
  expect(front.cards.at(-1)?.id).toBe(board.cards[0].id);
  expect(front.scene_order).toEqual(board.scene_order);
  const back = layerCard(front, board.cards[0].id, false);
  expect(back.cards[0].id).toBe(board.cards[0].id);
  const trashed = trashCard(front, board.cards[0].id);
  expect(trashed.trash).toHaveLength(1);
  expect(trashed.scene_order).not.toContain(board.cards[0].id);
  const restored = restoreCard(trashed, board.cards[0].id);
  expect(boardSchema.safeParse(restored).success).toBe(true);
  expect(restored.trash).toHaveLength(0);
  const duplicate = cloneCard({
    ...board.cards[0],
    tasks: [{ id: crypto.randomUUID(), text: "Audio", done: true, indent: 0, assignee: "", due_date: "" }],
  });
  expect(duplicate.id).not.toBe(board.cards[0].id);
  expect(duplicate.tasks[0].done).toBe(true);
});

it("validates colors and migrates older boards to the default canvas", () => {
  const b = newBoard("Colors");
  const c = newCard("note");
  expect(
    boardSchema.parse({
      ...b,
      cards: [{ ...c, strip_color: "#D48D99", background_color: "#e3effa" }],
    }).cards[0].strip_color,
  ).toBe("#D48D99");
  expect(
    boardSchema.safeParse({
      ...b,
      cards: [{ ...c, background_color: "url(javascript:bad)" }],
    }).success,
  ).toBe(false);
  const { background, ...old } = b;
  expect(boardSchema.parse(old).background).toBe("default");
});

it("keeps the same world coordinate under the cursor while zooming", () => {
  const nextScroll = zoomBoardOffset(200, 150, 1, 2);
  expect((nextScroll + 150) / 2).toBe(350);
  expect(clampBoardZoom(0)).toBe(0.2);
  expect(clampBoardZoom(10)).toBe(3);
});

describe("Board layout helpers", () => {
  const height = () => 100;
  function column() {
    return { ...newCard("column"), x: 100, y: 100, width: 320 };
  }
  it("stacks column cards in saved order and sizes the column", () => {
    const col = column();
    const a = { ...newCard("note"), parent_id: col.id, x: 900, y: 500 };
    const b = { ...newCard("note"), parent_id: col.id, x: 0, y: 200 };
    const free = { ...newCard("note"), x: 700, y: 700 };
    const cards = stackColumns([col, a, b, free], height);
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(byId.get(b.id)).toMatchObject({ x: 100 + COLUMN_PADDING, y: 100 + COLUMN_HEADER, width: 320 - COLUMN_PADDING * 2 });
    expect(byId.get(a.id)!.y).toBe(100 + COLUMN_HEADER + 100 + COLUMN_GAP);
    expect(byId.get(free.id)).toBe(free);
    expect(byId.get(col.id)!.height).toBeGreaterThan(COLUMN_HEADER + 200);
    expect(stackColumns(cards, height)).toBe(cards);
  });
  it("leaves collapsed columns alone", () => {
    const col = { ...column(), collapsed: true };
    const child = { ...newCard("note"), parent_id: col.id, x: 2000, y: 2000 };
    const cards = [col, child];
    expect(stackColumns(cards, height)).toBe(cards);
  });
  it("orders a dropped card between existing column cards", () => {
    const col = column();
    const [a, b] = stackColumns([col, { ...newCard("note"), parent_id: col.id, y: 1 }, { ...newCard("note"), parent_id: col.id, y: 2 }], height).slice(1);
    const between = columnInsertion([col, a, b], col, b.y + 10, height, new Set());
    expect(between.order).toBeGreaterThan(a.y);
    expect(between.order).toBeLessThan(b.y);
    const end = columnInsertion([col, a, b], col, b.y + 90, height, new Set());
    expect(end.order).toBeGreaterThan(b.y);
  });
  it("copies groups with new ids and keeps only internal relationships", () => {
    const col = column();
    const child = { ...newCard("note"), parent_id: col.id };
    const outsider = { ...newCard("note"), parent_id: crypto.randomUUID() };
    const line = { ...newCard("line"), line_start_connection: { card_id: child.id, edge: "top" as const, offset: 0.5 }, line_end_connection: { card_id: crypto.randomUUID(), edge: "left" as const, offset: 0 }, line_start_x: 10, line_start_y: 10 };
    const copies = cloneCards([col, child, outsider, line], 50, 20);
    expect(new Set(copies.map((c) => c.id)).size).toBe(4);
    expect(copies.some((c, i) => c.id === [col, child, outsider, line][i].id)).toBe(false);
    expect(copies[1].parent_id).toBe(copies[0].id);
    expect(copies[2].parent_id).toBeNull();
    expect(copies[3].line_start_connection?.card_id).toBe(copies[1].id);
    expect(copies[3].line_end_connection).toBeNull();
    expect(copies[3]).toMatchObject({ line_start_x: 60, line_start_y: 30, x: line.x + 50 });
    const board = { ...newBoard("Copy"), cards: copies };
    expect(boardSchema.safeParse(board).success).toBe(true);
  });
  it("aligns and distributes selected cards and moves column contents along", () => {
    const a = { ...newCard("note"), x: 10, y: 0 };
    const b = { ...newCard("note"), x: 200, y: 50, width: 300 };
    const col = { ...column(), x: 900, y: 10 };
    const child = { ...newCard("note"), parent_id: col.id, x: 912, y: 60 };
    const ids = new Set([a.id, b.id, col.id]);
    const left = alignCards([a, b, col, child], ids, "left", height);
    expect(left.map((c) => c.x)).toEqual([10, 10, 10, 22]);
    const top = alignCards([a, b, col, child], ids, "top", height);
    expect(top.map((c) => c.y)).toEqual([0, 0, 0, 50]);
    const spread = alignCards([a, b, col], ids, "distribute-x", height);
    const gaps = [spread[1].x - (spread[0].x + spread[0].width), spread[2].x - (spread[1].x + spread[1].width)];
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThanOrEqual(1);
    expect(alignCards([a], new Set([a.id]), "left", height)).toEqual([a]);
  });
  it("restores a column card to the canvas when its column is gone", () => {
    const col = column();
    const child = { ...newCard("note"), parent_id: col.id };
    let board = { ...newBoard("Restore"), cards: [col, child] };
    board = trashCard(board, child.id);
    board = trashCard(board, col.id);
    board = restoreCard(board, child.id);
    expect(board.cards[0].parent_id).toBeNull();
    expect(boardSchema.safeParse(board).success).toBe(true);
  });
  it("builds a compact preview without lines", () => {
    const preview = boardPreview([newCard("note"), newCard("line"), { ...newCard("color"), color_value: "#123456" }]);
    expect(preview).toHaveLength(2);
    expect(preview[1]).toEqual(expect.objectContaining({ kind: "color", color_value: "#123456" }));
    expect(Object.keys(preview[0])).not.toContain("body");
  });
});

describe("upload limits", () => {
  it("allows 10 MB for images and 50 MB for everything else", async () => {
    const { boardAssetLimit, BOARD_IMAGE_MAX_BYTES, BOARD_FILE_MAX_BYTES, boardCardSchema, newCard } = await import("../src/lib/boards");
    expect(boardAssetLimit("image/png")).toBe(10 * 1024 * 1024);
    expect(BOARD_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    for (const type of ["video/mp4", "audio/mpeg", "application/pdf", "application/zip", "text/plain"])
      expect(boardAssetLimit(type)).toBe(50 * 1024 * 1024);
    // A 50 MB file's size can be stored on its card.
    expect(boardCardSchema.safeParse({ ...newCard("file"), file_size: BOARD_FILE_MAX_BYTES }).success).toBe(true);
    expect(boardCardSchema.safeParse({ ...newCard("file"), file_size: BOARD_FILE_MAX_BYTES + 1 }).success).toBe(false);
  });
});
