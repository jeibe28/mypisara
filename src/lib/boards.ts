import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { SHAPE_IDS } from "./board-shapes";

export const cardKinds = [
  "note",
  "image",
  "link",
  "checklist",
  "scene",
  "group",
  "line",
  "column",
  "board",
  "file",
  "video",
  "color",
  "video_link",
  "audio_link",
  "shape",
] as const;
export function sanitizeBoardRichText(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "h2",
      "h3",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "a",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      // Browsers write <b>/<i> when you press Bold/Italic; keep that formatting as the semantic tags.
      b: "strong",
      i: "em",
      // Each new line in the editor is a <div>; keep it as a paragraph so lines don't run together.
      div: "p",
      strike: "s",
      del: "s",
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href || "",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}
const lineConnectionSchema = z
  .object({
    card_id: z.string().uuid(),
    edge: z.enum(["top", "right", "bottom", "left"]),
    offset: z.number().min(0).max(1),
  })
  .nullable()
  .default(null);
export const boardCardSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(cardKinds),
  title: z.string().max(200),
  body: z.string().max(20000),
  body_html: z.string().max(50000).default("").transform(sanitizeBoardRichText),
  created_by_id: z.string().max(200).default(""),
  created_by_name: z.string().max(200).default(""),
  parent_id: z.string().uuid().nullable().default(null),
  collapsed: z.boolean().default(false),
  // A locked card cannot be dragged or resized, so it can stay put under other work.
  locked: z.boolean().default(false),
  // Hides finished items on a to-do card; progress still counts them.
  hide_done: z.boolean().default(false),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(12)
    .default([])
    .transform((tags) => [...new Set(tags)]),
  target_board_id: z.string().uuid().nullable().default(null),
  file_name: z.string().max(255).default(""),
  file_type: z.string().max(120).default(""),
  file_size: z.number().int().min(0).max(52_428_800).default(0),
  caption: z.string().max(1000).default(""),
  heading_size: z.enum(["xlarge", "large", "normal", "small"]).default("large"),
  heading_font: z.enum(["sans", "serif", "mono", "hand", "display"]).default("sans"),
  heading_align: z.enum(["left", "center", "right"]).default("left"),
  link_show_image: z.boolean().default(true),
  link_show_description: z.boolean().default(true),
  link_preview: z.object({
    url: z.string().max(2048),
    title: z.string().max(200),
    description: z.string().max(1000),
    image: z.string().max(2048).refine((v) => !v || /^https?:\/\//i.test(v)),
    site_name: z.string().max(200),
  }).nullable().default(null),
  image_fit: z.enum(["contain", "cover"]).default("contain"),
  image_position_x: z.number().min(0).max(100).default(50),
  image_position_y: z.number().min(0).max(100).default(50),
  color_value: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#9cbc83"),
  x: z.number().min(0).max(10000),
  y: z.number().min(0).max(10000),
  width: z.number().min(120).max(2000),
  height: z.number().min(40).max(2000).nullable().default(null),
  strip_color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .default(null),
  background_color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .default(null),
  line_color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#9cbc83"),
  // Shape cards and lines share these: a clean outline or a hand-drawn one (seeded, so it never jitters).
  shape: z.enum(SHAPE_IDS).default("rounded"),
  sketchy: z.boolean().default(false),
  shape_seed: z.number().int().min(1).max(99999).default(1),
  line_arrow_style: z.enum(["triangle", "open", "dot", "bar"]).default("triangle"),
  line_routing: z.enum(["straight", "elbow"]).default("straight"),
  label_color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .default(null),
  label_background: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .default(null),
  line_weight: z.number().min(1).max(8).default(3),
  line_dashed: z.boolean().default(false),
  line_start_arrow: z.boolean().default(false),
  line_end_arrow: z.boolean().default(false),
  line_start_connection: lineConnectionSchema,
  line_end_connection: lineConnectionSchema,
  line_start_x: z.number().min(0).max(10000).nullable().default(null),
  line_start_y: z.number().min(0).max(10000).nullable().default(null),
  line_end_x: z.number().min(0).max(10000).nullable().default(null),
  line_end_y: z.number().min(0).max(10000).nullable().default(null),
  line_bend: z.number().min(-2000).max(2000).nullable().default(null),
  // Slides the curve along the line, so it can lean toward either end.
  line_shift: z.number().min(-2000).max(2000).nullable().default(null),
  color: z.enum(["sage", "sand", "blue", "rose", "lilac"]),
  url: z
    .string()
    .max(2048)
    .refine((v) => !v || /^https?:\/\//i.test(v), "Use an http or https URL"),
  image: z.string().max(1500000),
  duration: z.string().max(80),
  dialogue: z.string().max(5000),
  tasks: z
    .array(
      z.object({
        id: z.string().uuid(),
        text: z.string().max(1000),
        done: z.boolean(),
        indent: z.number().int().min(0).max(3).default(0),
          assignee: z.string().max(200).default(""),
          due_date: z
            .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
            .default(""),
      }),
    )
    .max(100),
});
export const boardSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    background: z
      .enum(["default", "paper", "slate", "sage", "sand", "blue"])
      .default("default"),
    cards: z.array(boardCardSchema).max(300),
    trash: z.array(boardCardSchema).max(300).default([]),
    scene_order: z.array(z.string().uuid()).max(300),
    revision: z.number().int().nonnegative(),
    updated_at: z.string(),
  })
  .superRefine((board, ctx) => {
    const all = [...board.cards, ...board.trash];
    const ids = new Set(all.map((c) => c.id));
    const scenes = new Set(
      board.cards.filter((c) => c.kind === "scene").map((c) => c.id),
    );
    const columns = new Set(
      board.cards.filter((c) => c.kind === "column").map((c) => c.id),
    );
    if (
      ids.size !== all.length ||
      all.length > 300 ||
      new Set(board.scene_order).size !== board.scene_order.length ||
      board.scene_order.length !== scenes.size ||
      board.scene_order.some((id) => !scenes.has(id))
    )
      ctx.addIssue({
        code: "custom",
        message: "Card IDs and scene order must be unique and consistent",
      });
    board.cards.forEach((card, index) => {
      if (card.parent_id && !columns.has(card.parent_id))
        ctx.addIssue({
          code: "custom",
          path: ["cards", index, "parent_id"],
          message: "Column membership must reference an active column",
        });
    });
  });
export type BoardCard = z.infer<typeof boardCardSchema>;
export type Board = z.infer<typeof boardSchema>;
export const BOARD_STORAGE = "mypisara.boards.demo.v1";
export function newCard(kind: BoardCard["kind"], index = 0): BoardCard {
  return {
    id: crypto.randomUUID(),
    kind,
    title:
      kind === "scene"
        ? "Untitled scene"
        : kind === "group"
          ? ""
          : kind === "column"
            ? "Column"
            : kind === "board"
              ? "Linked board"
              : kind === "color"
                ? "Color swatch"
                : "",
    body: "",
    body_html: "",
    created_by_id: "",
    created_by_name: "",
    parent_id: null,
    collapsed: false,
    locked: false,
    hide_done: false,
    tags: [],
    target_board_id: null,
    file_name: "",
    file_type: "",
    file_size: 0,
    caption: "",
    heading_size: "large",
    heading_font: "sans",
    heading_align: "left",
    link_show_image: true,
    link_show_description: true,
    link_preview: null,
    image_fit: "contain",
    image_position_x: 50,
    image_position_y: 50,
    color_value: "#9cbc83",
    x: 40 + (index % 4) * 300,
    y: 40 + Math.floor(index / 4) * 330,
    width: kind === "column" ? 320 : kind === "color" || kind === "shape" ? 180 : 270,
    height: kind === "line" ? 120 : kind === "column" ? 500 : kind === "shape" ? 120 : null,
    color: "sage",
    strip_color: null,
    background_color: null,
    line_color: "#9cbc83",
    label_color: null,
    label_background: null,
    shape: "rounded",
    sketchy: false,
    shape_seed: 1,
    line_arrow_style: "triangle",
    line_routing: "straight",
    line_weight: 3,
    line_dashed: false,
    line_start_arrow: false,
    line_end_arrow: false,
    line_start_connection: null,
    line_end_connection: null,
    line_start_x: null,
    line_start_y: null,
    line_end_x: null,
    line_end_y: null,
    line_bend: null,
    line_shift: null,
    url: "",
    image: "",
    duration: "",
    dialogue: "",
    tasks: [],
  };
}
export function newBoard(title: string): Board {
  const cards: BoardCard[] = [];
  return {
    id: crypto.randomUUID(),
    title,
    background: "default",
    cards,
    trash: [],
    scene_order: cards.map((c) => c.id),
    revision: 0,
    updated_at: new Date().toISOString(),
  };
}
export function validBoardImage(value: string, owner?: string): boolean {
  return (
    !value ||
    (owner
      ? value.startsWith(`board-assets/${owner}/`) && !value.includes("..")
      : /^data:(image\/(png|jpeg|webp|gif)|application\/pdf|video\/(mp4|webm|quicktime)|audio\/(mpeg|wav|mp4)|text\/plain);base64,[A-Za-z0-9+/=]+$/.test(
          value,
        ))
  );
}

// Array order is canvas layer order; storyboard sequence remains independent.
export function layerCard(board: Board, id: string, front: boolean): Board {
  const card = board.cards.find((c) => c.id === id);
  if (!card) return board;
  const rest = board.cards.filter((c) => c.id !== id);
  return { ...board, cards: front ? [...rest, card] : [card, ...rest] };
}
export function trashCard(board: Board, id: string): Board {
  const card = board.cards.find((c) => c.id === id);
  if (!card) return board;
  return {
    ...board,
    cards: board.cards
      .filter((c) => c.id !== id)
      .map((c) => (c.parent_id === id ? { ...c, parent_id: null } : c)),
    trash: [...board.trash, card],
    scene_order: board.scene_order.filter((v) => v !== id),
  };
}
export function restoreCard(board: Board, id: string): Board {
  const trashed = board.trash.find((c) => c.id === id);
  if (!trashed) return board;
  // A card whose column was trashed after it returns to the open canvas.
  const card = trashed.parent_id &&
    !board.cards.some((c) => c.id === trashed.parent_id && c.kind === "column")
    ? { ...trashed, parent_id: null }
    : trashed;
  return {
    ...board,
    cards: [...board.cards, card],
    trash: board.trash.filter((c) => c.id !== id),
    scene_order:
      card.kind === "scene"
        ? [...board.scene_order, card.id]
        : board.scene_order,
  };
}
export function cloneCard(
  card: BoardCard,
  x = card.x + 30,
  y = card.y + 30,
): BoardCard {
  return {
    ...card,
    id: crypto.randomUUID(),
    x: Math.min(10000, Math.max(0, x)),
    y: Math.min(10000, Math.max(0, y)),
    tasks: card.tasks.map((t) => ({ ...t, id: crypto.randomUUID() })),
  };
}

// Copies a set of cards, keeping column membership and line connections
// that point inside the set and detaching anything that points outside it.
export function cloneCards(cards: BoardCard[], dx = 30, dy = 30): BoardCard[] {
  const ids = new Map(cards.map((card) => [card.id, crypto.randomUUID()]));
  const clamp = (v: number | null) => v === null ? null : Math.min(10000, Math.max(0, v));
  const connection = (value: BoardCard["line_start_connection"]) =>
    value && ids.has(value.card_id) ? { ...value, card_id: ids.get(value.card_id)! } : null;
  return cards.map((card) => ({
    ...card,
    id: ids.get(card.id)!,
    x: clamp(card.x + dx)!,
    y: clamp(card.y + dy)!,
    parent_id: card.parent_id && ids.has(card.parent_id) ? ids.get(card.parent_id)! : null,
    line_start_x: clamp(card.line_start_x === null ? null : card.line_start_x + dx),
    line_start_y: clamp(card.line_start_y === null ? null : card.line_start_y + dy),
    line_end_x: clamp(card.line_end_x === null ? null : card.line_end_x + dx),
    line_end_y: clamp(card.line_end_y === null ? null : card.line_end_y + dy),
    line_start_connection: connection(card.line_start_connection),
    line_end_connection: connection(card.line_end_connection),
    tasks: card.tasks.map((t) => ({ ...t, id: crypto.randomUUID() })),
  }));
}

export const COLUMN_HEADER = 50;
export const COLUMN_PADDING = 12;
export const COLUMN_GAP = 10;
export const COLUMN_MIN_WIDTH = 260;
const COLUMN_DROP_SPACE = 40;
export function columnChildren(cards: BoardCard[], columnId: string): BoardCard[] {
  return cards.filter((card) => card.parent_id === columnId).sort((a, b) => a.y - b.y);
}
// Columns stack their cards top to bottom. Child order comes
// from saved y positions, so dropping a card between two others reorders it.
export function stackColumns(
  cards: BoardCard[],
  heightOf: (card: BoardCard) => number,
): BoardCard[] {
  const updates = new Map<string, Partial<BoardCard>>();
  for (const column of cards) {
    if (column.kind !== "column" || column.collapsed) continue;
    let y = column.y + COLUMN_HEADER;
    const width = Math.max(220, column.width - COLUMN_PADDING * 2);
    for (const child of columnChildren(cards, column.id)) {
      updates.set(child.id, { x: Math.min(10000, column.x + COLUMN_PADDING), y: Math.min(10000, y), width });
      y += heightOf(child) + COLUMN_GAP;
    }
    const height = Math.min(2000, Math.max(140, y - column.y + COLUMN_DROP_SPACE - COLUMN_GAP));
    updates.set(column.id, { height });
  }
  let changed = false;
  const next = cards.map((card) => {
    const patch = updates.get(card.id);
    if (!patch) return card;
    const differs = (Object.keys(patch) as (keyof BoardCard)[]).some(
      (key) => Math.abs(Number(card[key] ?? -1) - Number(patch[key])) > 0.5,
    );
    if (!differs) return card;
    changed = true;
    return { ...card, ...patch };
  });
  return changed ? next : cards;
}
// Where a card dropped at canvas y would land inside a column.
export function columnInsertion(
  cards: BoardCard[],
  column: BoardCard,
  y: number,
  heightOf: (card: BoardCard) => number,
  exclude: Set<string>,
): { y: number; order: number } {
  const children = columnChildren(cards, column.id).filter((card) => !exclude.has(card.id));
  for (const child of children) {
    if (y < child.y + heightOf(child) / 2)
      return { y: child.y - COLUMN_GAP / 2, order: child.y - COLUMN_GAP / 2 - 0.5 };
  }
  const last = children.at(-1);
  const end = last ? last.y + heightOf(last) + COLUMN_GAP / 2 : column.y + COLUMN_HEADER - COLUMN_GAP / 2;
  return { y: end, order: end + 1 };
}

export type BoardAlignment =
  | "left" | "center" | "right" | "top" | "middle" | "bottom"
  | "distribute-x" | "distribute-y";
export function alignCards(
  cards: BoardCard[],
  ids: Set<string>,
  mode: BoardAlignment,
  heightOf: (card: BoardCard) => number,
): BoardCard[] {
  const chosen = cards.filter((c) => ids.has(c.id) && c.kind !== "line" && !c.parent_id);
  if (chosen.length < 2) return cards;
  const left = Math.min(...chosen.map((c) => c.x));
  const top = Math.min(...chosen.map((c) => c.y));
  const right = Math.max(...chosen.map((c) => c.x + c.width));
  const bottom = Math.max(...chosen.map((c) => c.y + heightOf(c)));
  const positions = new Map<string, { x: number; y: number }>();
  if (mode === "distribute-x" || mode === "distribute-y") {
    const horizontal = mode === "distribute-x";
    const size = (c: BoardCard) => horizontal ? c.width : heightOf(c);
    const sorted = [...chosen].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
    const total = sorted.reduce((sum, c) => sum + size(c), 0);
    const gap = Math.max(0, ((horizontal ? right - left : bottom - top) - total) / (sorted.length - 1));
    let cursor = horizontal ? left : top;
    for (const c of sorted) {
      positions.set(c.id, horizontal ? { x: cursor, y: c.y } : { x: c.x, y: cursor });
      cursor += size(c) + gap;
    }
  } else
    for (const c of chosen) {
      const h = heightOf(c);
      positions.set(c.id, {
        x: mode === "left" ? left : mode === "center" ? (left + right - c.width) / 2 : mode === "right" ? right - c.width : c.x,
        y: mode === "top" ? top : mode === "middle" ? (top + bottom - h) / 2 : mode === "bottom" ? bottom - h : c.y,
      });
    }
  const moves = new Map<string, { dx: number; dy: number }>();
  for (const c of chosen) {
    const p = positions.get(c.id)!;
    moves.set(c.id, { dx: Math.round(p.x) - c.x, dy: Math.round(p.y) - c.y });
  }
  // Cards inside a column travel with it.
  for (const c of cards)
    if (c.parent_id && moves.has(c.parent_id)) moves.set(c.id, moves.get(c.parent_id)!);
  return cards.map((c) => {
    const move = moves.get(c.id);
    if (!move || (!move.dx && !move.dy)) return c;
    return {
      ...c,
      x: Math.min(10000, Math.max(0, c.x + move.dx)),
      y: Math.min(10000, Math.max(0, c.y + move.dy)),
    };
  });
}

export type BoardPreviewCard = Pick<
  BoardCard,
  "kind" | "x" | "y" | "width" | "height" | "background_color" | "color_value" | "parent_id"
>;
export function boardPreview(cards: BoardCard[]): BoardPreviewCard[] {
  return cards
    .filter((card) => card.kind !== "line")
    .slice(0, 80)
    .map(({ kind, x, y, width, height, background_color, color_value, parent_id }) => ({
      kind, x, y, width, height, background_color, color_value, parent_id,
    }));
}

export function clampBoardZoom(value: number): number {
  return Math.min(3, Math.max(0.2, value));
}
export function zoomBoardOffset(
  scroll: number,
  cursor: number,
  before: number,
  after: number,
): number {
  return Math.max(0, ((scroll + cursor) / before) * after - cursor);
}
export function lightCardBackground(hex: string): boolean {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 155;
}

// Pictures stay light so boards load fast; video, audio and documents can be bigger.
export const BOARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const BOARD_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const BOARD_ASSET_MAX_BYTES = BOARD_FILE_MAX_BYTES;
// Files above this go straight to storage from the browser: a normal request to the server
// can't carry them on this host.
export const BOARD_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
export const boardAssetLimit = (type: string) => (type.startsWith("image/") ? BOARD_IMAGE_MAX_BYTES : BOARD_FILE_MAX_BYTES);
export const boardAssetLimitLabel = (type: string) => (type.startsWith("image/") ? "10 MB" : "50 MB");
export const BOARD_DEMO_ASSET_MAX_BYTES = 500_000;
export const BOARD_ASSET_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// Heading typefaces: five essentials, bundled so boards and exports look the same everywhere.
export const HEADING_FONTS = {
  sans: { label: "Sans", family: '"Inter Variable", -apple-system, system-ui, sans-serif', weight: 700, scale: 1 },
  serif: { label: "Serif", family: '"Fraunces Variable", Georgia, "Times New Roman", serif', weight: 700, scale: 1 },
  mono: { label: "Mono", family: '"JetBrains Mono Variable", ui-monospace, Menlo, monospace', weight: 700, scale: 0.9 },
  hand: { label: "Handwritten", family: 'Caveat, "Comic Sans MS", cursive', weight: 700, scale: 1.2 },
  display: { label: "Display", family: '"Bebas Neue", Impact, "Arial Narrow", sans-serif', weight: 400, scale: 1.1 },
} as const;
export const HEADING_SIZE_PX = { xlarge: 40, large: 26, normal: 19, small: 12 } as const;
export const HEADING_SIZE_LABELS = { xlarge: "Display", large: "Title", normal: "Heading", small: "Label" } as const;
export function headingFontStyle(card: Pick<BoardCard, "heading_font" | "heading_size">) {
  const font = HEADING_FONTS[card.heading_font] ?? HEADING_FONTS.sans;
  const px = Math.round(HEADING_SIZE_PX[card.heading_size] * font.scale * 10) / 10;
  return { fontFamily: font.family, fontWeight: font.weight, fontSize: `calc(${px}px * var(--ui-scale, 1))` };
}
