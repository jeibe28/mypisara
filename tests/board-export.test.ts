import { describe, expect, it } from "vitest";
import { boardToMarkdown, exportCards, exportFileName, parseBoardBackup } from "@/lib/board-export";
import { newBoard, newCard, type Board, type BoardCard } from "@/lib/boards";

function sample(): Board {
  const board = newBoard("Spring / campaign: ideas");
  const make = (kind: BoardCard["kind"], patch: Partial<BoardCard>) => ({ ...newCard(kind), ...patch });
  const column = make("column", { title: "Doing", x: 400, y: 40 });
  board.cards = [
    make("note", { title: "Idea", body: "Ship the beta", x: 40, y: 40 }),
    make("checklist", {
      title: "Launch",
      x: 40,
      y: 200,
      tasks: [
        { id: crypto.randomUUID(), text: "Write copy", done: true, indent: 0, assignee: "Sam", due_date: "2026-11-01" },
        { id: crypto.randomUUID(), text: "Sub-step", done: false, indent: 1, assignee: "", due_date: "" },
      ],
    }),
    make("video_link", { url: "https://youtu.be/dQw4w9WgXcQ", title: "Demo", x: 40, y: 400 }),
    column,
    make("note", { body: "In a column", parent_id: column.id, y: 0 }),
  ];
  board.scene_order = [];
  return board;
}

describe("board export", () => {
  it("writes a Markdown outline with tasks, links and columns", () => {
    const text = boardToMarkdown(sample());
    expect(text).toContain("# Spring / campaign: ideas");
    expect(text).toContain("**Idea**\n\nShip the beta");
    expect(text).toContain("- [x] Write copy (Sam · 2026-11-01)");
    expect(text).toContain("  - [ ] Sub-step");
    expect(text).toContain("[Demo](https://youtu.be/dQw4w9WgXcQ)");
    expect(text.indexOf("## Doing")).toBeLessThan(text.indexOf("In a column"));
  });

  it("limits a selection export to the chosen cards and column contents", () => {
    const board = sample();
    const column = board.cards.find((card) => card.kind === "column")!;
    const picked = exportCards(board, [column.id]);
    expect(picked).toHaveLength(2);
    expect(exportCards(board)).toHaveLength(board.cards.length);
  });

  it("builds a safe, dated file name", () => {
    expect(exportFileName(sample(), "png")).toMatch(/^Spring campaign ideas – \d{4}-\d{2}-\d{2}\.png$/);
    expect(exportFileName(sample(), "png")).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("imports a backup as a new board and drops files it cannot access", () => {
    const board = sample();
    board.cards.push({ ...newCard("file"), image: "board-assets/another-user/file.png", file_name: "file.png", file_type: "image/png", file_size: 10 });
    board.cards.push({ ...newCard("board"), target_board_id: crypto.randomUUID(), title: "Child" });
    const { board: imported, droppedFiles } = parseBoardBackup(JSON.stringify(board), "me");
    expect(imported.id).not.toBe(board.id);
    expect(imported.revision).toBe(0);
    expect(droppedFiles).toBe(1);
    expect(imported.cards.find((card) => card.kind === "file")?.image).toBe("");
    expect(imported.cards.find((card) => card.kind === "board")?.target_board_id).toBeNull();
  });

  it("rejects files that are not board backups", () => {
    expect(() => parseBoardBackup("not json")).toThrow(/backup/);
    expect(() => parseBoardBackup(JSON.stringify({ hello: "world" }))).toThrow(/backup/);
  });
});
