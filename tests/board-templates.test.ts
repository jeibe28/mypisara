import { describe, expect, it } from "vitest";
import { BOARD_TEMPLATES, boardFromTemplate } from "@/lib/board-templates";
import { boardSchema } from "@/lib/boards";

describe("board templates", () => {
  for (const template of BOARD_TEMPLATES) {
    it(`${template.name} produces a valid board`, () => {
      const board = boardFromTemplate(template.id, "My board");
      expect(boardSchema.safeParse(board).success).toBe(true);
      expect(board.title).toBe("My board");
    });
  }

  it("kanban has three columns with a starter note inside the first", () => {
    const board = boardFromTemplate("kanban", "Work");
    const columns = board.cards.filter((card) => card.kind === "column");
    expect(columns.map((card) => card.title)).toEqual(["To do", "Doing", "Done"]);
    expect(board.cards.filter((card) => card.parent_id === columns[0].id)).toHaveLength(1);
  });
});
