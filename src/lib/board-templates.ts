import { newBoard, newCard, type Board, type BoardCard } from "./boards";

export type TemplateId = "blank" | "kanban" | "brainstorm" | "weekly" | "meeting";

export const BOARD_TEMPLATES: { id: TemplateId; name: string; description: string; placeholder: string }[] = [
  { id: "blank", name: "Blank", description: "An empty canvas", placeholder: "e.g. Spring campaign ideas" },
  { id: "kanban", name: "Kanban", description: "To do, Doing, Done", placeholder: "e.g. Website relaunch" },
  { id: "brainstorm", name: "Brainstorm", description: "A topic with idea notes", placeholder: "e.g. Product names" },
  { id: "weekly", name: "Weekly plan", description: "Monday to Friday plus goals", placeholder: "e.g. Week of Oct 14" },
  { id: "meeting", name: "Meeting notes", description: "Agenda, decisions, actions", placeholder: "e.g. Design sync" },
];

type Patch = Partial<BoardCard>;

function task(text: string, done = false): BoardCard["tasks"][number] {
  return { id: crypto.randomUUID(), text, done, indent: 0, assignee: "", due_date: "" };
}

export function boardFromTemplate(id: TemplateId, title: string): Board {
  const board = newBoard(title);
  const make = (kind: BoardCard["kind"], patch: Patch): BoardCard => ({ ...newCard(kind), ...patch });
  const cards: BoardCard[] = [];

  if (id === "kanban") {
    ["To do", "Doing", "Done"].forEach((name, index) => {
      const column = make("column", { title: name, x: 40 + index * 360, y: 40, width: 320 });
      cards.push(column);
      if (index === 0)
        cards.push(
          make("note", { title: "First task", body: "Drag cards between columns.", parent_id: column.id, y: 0 }),
        );
    });
  } else if (id === "brainstorm") {
    cards.push(make("group", { title, x: 40, y: 30, width: 520 }));
    const ideas: [number, number, string][] = [
      [40, 120, "Idea 1"], [330, 120, "Idea 2"], [620, 120, "Idea 3"],
      [185, 320, "Idea 4"], [475, 320, "Idea 5"],
    ];
    ideas.forEach(([x, y, label], index) =>
      cards.push(make("note", { title: label, body: "", x, y, color: (["sage", "sand", "blue", "rose", "lilac"] as const)[index] })),
    );
  } else if (id === "weekly") {
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].forEach((day, index) =>
      cards.push(make("column", { title: day, x: 40 + index * 300, y: 200, width: 270, height: 520 })),
    );
    cards.push(make("group", { title: "Week at a glance", x: 40, y: 30, width: 520 }));
    cards.push(
      make("checklist", {
        title: "Goals this week",
        x: 40,
        y: 90,
        width: 400,
        tasks: [task("Top priority"), task("Second priority"), task("Nice to have")],
      }),
    );
  } else if (id === "meeting") {
    cards.push(make("group", { title, x: 40, y: 30, width: 520 }));
    cards.push(make("note", { title: "Agenda", body: "1. \n2. \n3. ", x: 40, y: 110, width: 360, color: "blue" }));
    cards.push(make("note", { title: "Notes", body: "", x: 440, y: 110, width: 360, color: "sage" }));
    cards.push(make("note", { title: "Decisions", body: "", x: 40, y: 360, width: 360, color: "sand" }));
    cards.push(
      make("checklist", {
        title: "Action items",
        x: 440,
        y: 360,
        width: 360,
        tasks: [task("Owner: follow up on…")],
      }),
    );
  }

  board.cards = cards;
  board.scene_order = [];
  return board;
}
