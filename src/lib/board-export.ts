import { captureBoard, flattenOnWhite, toBlob, type CaptureBackground } from "./board-capture";
import { linePathData, shapePath } from "./board-shapes";
import { boardSchema, HEADING_FONTS, HEADING_SIZE_PX, validBoardImage, type Board, type BoardCard } from "./boards";

export type ExportFormat = "png" | "jpeg" | "pdf" | "markdown" | "json";

export const EXPORT_FORMATS: { value: ExportFormat; label: string; hint: string; extension: string }[] = [
  { value: "png", label: "Image (PNG)", hint: "Sharp, keeps transparency", extension: "png" },
  { value: "jpeg", label: "Image (JPEG)", hint: "Smaller files for sharing", extension: "jpg" },
  { value: "pdf", label: "PDF", hint: "Print or email", extension: "pdf" },
  { value: "markdown", label: "Markdown outline", hint: "Paste into notes or docs", extension: "md" },
  { value: "json", label: "Backup (.json)", hint: "Restore later with Import", extension: "json" },
];

// Cards to export: everything, or a selection plus the contents of selected columns.
export function exportCards(board: Board, ids?: string[]): BoardCard[] {
  if (!ids?.length) return board.cards;
  const picked = new Set(ids);
  return board.cards.filter((card) => picked.has(card.id) || (card.parent_id && picked.has(card.parent_id)));
}

export function exportFileName(board: Board, extension: string) {
  const date = new Date().toISOString().slice(0, 10);
  const name = board.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Board";
  return `${name} – ${date}.${extension}`;
}

const byPosition = (a: BoardCard, b: BoardCard) => a.y - b.y || a.x - b.x;

// ---- Markdown ----

function line(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function cardToMarkdown(card: BoardCard): string {
  const title = line(card.title);
  switch (card.kind) {
    case "group":
      return `## ${title || "Heading"}`;
    case "checklist": {
      const items = card.tasks.map((task) => {
        const meta = [task.assignee, task.due_date].filter(Boolean).join(" · ");
        return `${"  ".repeat(task.indent)}- [${task.done ? "x" : " "}] ${line(task.text)}${meta ? ` (${meta})` : ""}`;
      });
      return [title && `**${title}**`, ...items].filter(Boolean).join("\n");
    }
    case "link":
    case "video_link":
    case "audio_link": {
      const fallback = card.kind === "video_link" ? "Video" : card.kind === "audio_link" ? "Audio" : card.url;
      const label = title || card.link_preview?.title || fallback || "Link";
      const body = card.body.trim();
      return `${card.url ? `[${label}](${card.url})` : label}${body ? `\n\n${body}` : ""}`;
    }
    case "image":
    case "scene":
      return `*Image${title ? `: ${title}` : ""}*${card.caption ? `\n\n${card.caption}` : ""}`;
    case "file":
    case "video":
      return `*File: ${card.file_name || title || "attachment"}*${card.caption ? `\n\n${card.caption}` : ""}`;
    case "board":
      return `*Board: ${title || "Linked board"}*`;
    case "color":
      return `*Color: ${card.color_value}${title ? ` (${title})` : ""}*`;
    case "line":
      return "";
    default:
      return [title && `**${title}**`, card.body.trim()].filter(Boolean).join("\n\n");
  }
}

export function boardToMarkdown(board: Board, cards: BoardCard[] = board.cards): string {
  const ids = new Set(cards.map((card) => card.id));
  const top = cards.filter((card) => card.kind !== "line" && (!card.parent_id || !ids.has(card.parent_id))).sort(byPosition);
  const blocks: string[] = [`# ${line(board.title) || "Board"}`];
  for (const card of top) {
    if (card.kind === "column") {
      blocks.push(`## ${line(card.title) || "Column"}`);
      for (const child of cards.filter((c) => c.parent_id === card.id).sort(byPosition)) {
        const text = cardToMarkdown(child);
        if (text) blocks.push(text);
      }
      continue;
    }
    const text = cardToMarkdown(card);
    if (text) blocks.push(text);
  }
  return `${blocks.join("\n\n")}\n`;
}

// ---- Backup import ----

export function parseBoardBackup(text: string, owner?: string): { board: Board; droppedFiles: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a MyPisara board backup.");
  }
  const parsed = boardSchema.safeParse(raw);
  if (!parsed.success) throw new Error("That file isn't a MyPisara board backup.");
  let droppedFiles = 0;
  const clean = (card: BoardCard): BoardCard => {
    if (validBoardImage(card.image, owner)) return card;
    droppedFiles += 1;
    return { ...card, image: "", file_name: "", file_type: "", file_size: 0 };
  };
  const board: Board = {
    ...parsed.data,
    id: crypto.randomUUID(),
    cards: parsed.data.cards.map(clean),
    trash: parsed.data.trash.map(clean),
    // Linked boards belong to the original; the copy keeps the card but not the link.
    revision: 0,
    updated_at: new Date().toISOString(),
  };
  board.cards = board.cards.map((card) => (card.kind === "board" ? { ...card, target_board_id: null } : card));
  board.trash = board.trash.map((card) => (card.kind === "board" ? { ...card, target_board_id: null } : card));
  return { board, droppedFiles };
}

// ---- Image rendering ----

const STRIP: Record<BoardCard["color"], string> = {
  sage: "#9cbc83", sand: "#d4b477", blue: "#82b2d3", rose: "#d48d99", lilac: "#b49bce",
};
const PAPER: Record<Board["background"], string> = {
  default: "#f7f6f1", paper: "#fbf7ec", slate: "#e7eaee", sage: "#e8efe1", sand: "#f3ead6", blue: "#e4eef7",
};
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const PAD = 14;

type Ctx = CanvasRenderingContext2D;
type Box = { card: BoardCard; x: number; y: number; w: number; h: number };

function wrap(ctx: Ctx, text: string, width: number, maxLines = 14): string[] {
  const out: string[] = [];
  const fits = (value: string) => ctx.measureText(value).width <= width;
  for (const paragraph of text.split(/\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current) out.push(current);
      // Break a single word that is wider than the card.
      let rest = word;
      while (!fits(rest) && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    out.push(current);
  }
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return out;
}

function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const luminance = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luminance < 110;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Height a card needs at a given width, matching what draw() paints.
function measure(ctx: Ctx, card: BoardCard, width: number): number {
  const inner = width - PAD * 2;
  let h = PAD * 2 + 3;
  const title = line(card.title);
  if (card.kind === "group") {
    const face = HEADING_FONTS[card.heading_font] ?? HEADING_FONTS.sans;
    const rows = (card.title || "Heading").split("\n").length;
    return Math.max(44, Math.round(HEADING_SIZE_PX[card.heading_size] * face.scale * 1.25) * rows + 12);
  }
  if (card.kind === "color") return card.height ?? 120;
  if (card.kind === "shape") return card.height ?? 120;
  if (card.kind === "image" || card.kind === "scene") return card.height ?? 190;
  if (title) {
    ctx.font = `700 15px ${FONT}`;
    h += wrap(ctx, title, inner, 3).length * 20 + 6;
  }
  ctx.font = `400 13px ${FONT}`;
  if (card.kind === "checklist") {
    for (const task of card.tasks) h += wrap(ctx, task.text || " ", inner - 22 - task.indent * 16, 4).length * 18 + 6;
  } else if (["link", "video_link", "audio_link"].includes(card.kind)) {
    h += 20;
    if (card.body.trim()) h += wrap(ctx, card.body, inner, 4).length * 18;
  } else if (card.kind === "file" || card.kind === "video" || card.kind === "board") {
    h += 24;
  } else if (card.body.trim()) {
    h += wrap(ctx, card.body, inner, 14).length * 18;
  }
  return Math.max(card.height ?? 0, h, 56);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawCard(ctx: Ctx, box: Box, images: Map<string, HTMLImageElement | null>) {
  const { card, x, y, w, h } = box;
  const bg = card.background_color ?? "#ffffff";
  const ink = isDark(bg) ? "#f2f2f2" : "#1d1d1b";
  const soft = isDark(bg) ? "#c8c8c8" : "#5b5b57";
  const inner = w - PAD * 2;
  const title = line(card.title);

  if (card.kind === "group") {
    ctx.fillStyle = "#1d1d1b";
    const face = HEADING_FONTS[card.heading_font] ?? HEADING_FONTS.sans;
    ctx.font = `${face.weight} ${Math.round(HEADING_SIZE_PX[card.heading_size] * face.scale)}px ${face.family}`;
    ctx.textAlign = card.heading_align === "center" ? "center" : card.heading_align === "right" ? "right" : "left";
    ctx.textBaseline = "middle";
    const tx = card.heading_align === "center" ? x + w / 2 : card.heading_align === "right" ? x + w : x;
    const rows = (card.title || "Heading").split("\n").map((row) => (card.heading_size === "small" ? row.toUpperCase() : row));
    const step = Math.round(HEADING_SIZE_PX[card.heading_size] * face.scale * 1.25);
    const top = y + h / 2 - ((rows.length - 1) * step) / 2;
    rows.forEach((row, index) => ctx.fillText(row || " ", tx, top + index * step, w));
    ctx.textAlign = "left";
    return;
  }
  if (card.kind === "image" && card.image && images.get(card.image)) {
    // Images are exported as the picture alone, so transparent areas stay transparent.
    const image = images.get(card.image)!;
    if (card.background_color) {
      ctx.fillStyle = card.background_color;
      ctx.fillRect(x, y, w, h);
    }
    const scale = Math.min(w / image.width, h / image.height);
    const iw = image.width * scale, ih = image.height * scale;
    ctx.drawImage(image, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    return;
  }
  if (card.kind === "shape") {
    const path = new Path2D(shapePath(card.shape, w, h, { sketchy: card.sketchy, seed: card.shape_seed, inset: card.line_weight / 2 + 2 }));
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (card.shape === "highlight") {
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = card.line_color;
      ctx.fill(path);
    } else {
      if (card.background_color && card.shape !== "circle" && card.shape !== "underline" && card.shape !== "cross" && card.shape !== "check") {
        ctx.fillStyle = card.background_color;
        ctx.fill(path);
      }
      ctx.strokeStyle = card.line_color;
      ctx.lineWidth = card.line_weight;
      ctx.setLineDash(card.line_dashed ? [card.line_weight * 3, card.line_weight * 2.4] : []);
      ctx.stroke(path);
    }
    ctx.restore();
    const label = card.title.trim();
    if (label) {
      ctx.font = `600 14px ${FONT}`;
      ctx.fillStyle = card.label_color ?? "#1d1d1b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const rows = wrap(ctx, label, w * 0.8, 6);
      const step = 18;
      rows.forEach((row, index) => ctx.fillText(row, x + w / 2, y + h / 2 + (index - (rows.length - 1) / 2) * step));
      ctx.textAlign = "left";
    }
    return;
  }
  if (card.kind === "color") {
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = card.color_value;
    ctx.fill();
    ctx.fillStyle = isDark(card.color_value) ? "#fff" : "#111";
    ctx.font = `600 13px ${FONT}`;
    ctx.textBaseline = "bottom";
    ctx.fillText(card.color_value.toUpperCase(), x + PAD, y + h - PAD);
    return;
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.10)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = card.kind === "column" ? "#efeee6" : bg;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#d9d6c8";
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10);
  ctx.stroke();
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = card.strip_color ?? STRIP[card.color];
  ctx.fillRect(x, y, w, 3);

  if (card.kind === "image" || card.kind === "scene") {
    const image = card.image ? images.get(card.image) : null;
    if (image) {
      const scale = Math.min(w / image.width, (h - 3) / image.height);
      const iw = image.width * scale;
      const ih = image.height * scale;
      ctx.drawImage(image, x + (w - iw) / 2, y + 3 + (h - 3 - ih) / 2, iw, ih);
    } else {
      ctx.fillStyle = soft;
      ctx.font = `500 13px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(title || "Image", x + w / 2, y + h / 2, inner);
      ctx.textAlign = "left";
    }
    ctx.restore();
    return;
  }

  let cy = y + PAD + 3;
  ctx.textBaseline = "top";
  if (title) {
    ctx.fillStyle = ink;
    ctx.font = `700 15px ${FONT}`;
    for (const text of wrap(ctx, title, inner, 3)) {
      ctx.fillText(text, x + PAD, cy);
      cy += 20;
    }
    cy += 6;
  }
  ctx.font = `400 13px ${FONT}`;
  if (card.kind === "column") {
    // children are drawn by the caller inside the frame
  } else if (card.kind === "checklist") {
    for (const task of card.tasks) {
      const indent = task.indent * 16;
      ctx.strokeStyle = soft;
      ctx.strokeRect(x + PAD + indent + 0.5, cy + 2.5, 12, 12);
      if (task.done) {
        ctx.beginPath();
        ctx.moveTo(x + PAD + indent + 3, cy + 9);
        ctx.lineTo(x + PAD + indent + 6, cy + 12);
        ctx.lineTo(x + PAD + indent + 11, cy + 5);
        ctx.stroke();
      }
      ctx.fillStyle = task.done ? soft : ink;
      for (const text of wrap(ctx, task.text || " ", inner - 22 - indent, 4)) {
        ctx.fillText(text, x + PAD + 22 + indent, cy);
        if (task.done && text.trim()) ctx.fillRect(x + PAD + 22 + indent, cy + 8, ctx.measureText(text).width, 1);
        cy += 18;
      }
      cy += 6;
    }
  } else if (["link", "video_link", "audio_link"].includes(card.kind)) {
    const prefix = card.kind === "video_link" ? "▶ " : card.kind === "audio_link" ? "♪ " : "";
    ctx.fillStyle = "#2c6fb3";
    ctx.fillText(`${prefix}${domainOf(card.url) || "Add a link"}`, x + PAD, cy, inner);
    cy += 20;
    if (card.body.trim()) {
      ctx.fillStyle = soft;
      for (const text of wrap(ctx, card.body, inner, 4)) {
        ctx.fillText(text, x + PAD, cy);
        cy += 18;
      }
    }
  } else if (card.kind === "file" || card.kind === "video" || card.kind === "board") {
    ctx.fillStyle = soft;
    ctx.fillText(
      card.kind === "board" ? "Board" : card.file_name || (card.kind === "video" ? "Video file" : "File"),
      x + PAD, cy, inner,
    );
  } else if (card.body.trim()) {
    ctx.fillStyle = ink;
    for (const text of wrap(ctx, card.body, inner, 14)) {
      ctx.fillText(text, x + PAD, cy);
      cy += 18;
    }
  }
  ctx.restore();
}

function edgePoint(box: Box, edge: "top" | "right" | "bottom" | "left", offset: number) {
  if (edge === "top") return { x: box.x + box.w * offset, y: box.y };
  if (edge === "bottom") return { x: box.x + box.w * offset, y: box.y + box.h };
  if (edge === "left") return { x: box.x, y: box.y + box.h * offset };
  return { x: box.x + box.w, y: box.y + box.h * offset };
}

export async function renderBoardCanvas(
  board: Board,
  cards: BoardCard[],
  assetUrl: (path: string) => string,
  scale = 2,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  // Headings use bundled web fonts; make sure each face is ready before drawing text with it.
  await Promise.all(
    [...new Set(cards.filter((card) => card.kind === "group").map((card) => card.heading_font))].map((id) => {
      const face = HEADING_FONTS[id] ?? HEADING_FONTS.sans;
      return document.fonts.load(`${face.weight} 20px ${face.family}`).catch(() => []);
    }),
  );
  const scratch = document.createElement("canvas").getContext("2d")!;
  const ids = new Set(cards.map((card) => card.id));
  const boxes = new Map<string, Box>();
  const topLevel = cards.filter((card) => card.kind !== "line" && (!card.parent_id || !ids.has(card.parent_id)));

  for (const card of topLevel) {
    const w = card.width;
    let h = measure(scratch, card, w);
    if (card.kind === "column") {
      const children = cards.filter((c) => c.parent_id === card.id).sort(byPosition);
      const header = line(card.title) ? 3 + PAD + 26 : PAD + 3;
      let used = header;
      for (const child of children) used += measure(scratch, child, w - 24) + 10;
      h = Math.max(h, used + PAD);
    }
    boxes.set(card.id, { card, x: card.x, y: card.y, w, h });
  }
  // Column children stack inside their column.
  const childBoxes: Box[] = [];
  for (const column of topLevel.filter((card) => card.kind === "column")) {
    const base = boxes.get(column.id)!;
    let cy = base.y + (line(column.title) ? 3 + PAD + 26 : PAD + 3);
    for (const child of cards.filter((c) => c.parent_id === column.id).sort(byPosition)) {
      const h = measure(scratch, child, base.w - 24);
      const box = { card: child, x: base.x + 12, y: cy, w: base.w - 24, h };
      boxes.set(child.id, box);
      childBoxes.push(box);
      cy += h + 10;
    }
  }

  const all = [...boxes.values()];
  const lines = cards.filter((card) => card.kind === "line");
  const pad = 48;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const box of all) { grow(box.x, box.y); grow(box.x + box.w, box.y + box.h); }
  const linePath = (card: BoardCard) => {
    const point = (connection: BoardCard["line_start_connection"], x: number | null, y: number | null, fx: number, fy: number) => {
      const box = connection ? boxes.get(connection.card_id) : undefined;
      if (connection && box) return edgePoint(box, connection.edge, connection.offset);
      return { x: x ?? fx, y: y ?? fy };
    };
    const start = point(card.line_start_connection, card.line_start_x, card.line_start_y, card.x, card.y);
    const end = point(card.line_end_connection, card.line_end_x, card.line_end_y, card.x + card.width, card.y + (card.height ?? 120));
    return { start, end };
  };
  for (const card of lines) {
    const { start, end } = linePath(card);
    grow(start.x, start.y); grow(end.x, end.y);
  }
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 400; maxY = 240; }

  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2);
  const ratio = Math.min(scale, 8000 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = PAPER[board.background];
  ctx.fillRect(0, 0, width, height);
  ctx.translate(pad - minX, pad - minY);

  const sources = [...new Set(cards.map((c) => c.image).filter((value) => value && (isImageSource(cards, value))))];
  const loaded = await Promise.all(sources.map((value) => loadImage(assetUrl(value))));
  const images = new Map(sources.map((value, index) => [value, loaded[index]]));

  for (const box of topLevel.map((card) => boxes.get(card.id)!)) {
    drawCard(ctx, box, images);
    if (box.card.kind === "column" && line(box.card.title)) {
      // The column title is part of drawCard; nothing else to do.
    }
  }
  for (const box of childBoxes) drawCard(ctx, box, images);

  for (const card of lines) {
    const { start, end } = linePath(card);
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const bend = card.line_bend ?? 0;
    const shift = card.line_shift ?? 0;
    const cx = (start.x + end.x) / 2 + (-dy / length) * bend + (dx / length) * shift;
    const cy = (start.y + end.y) / 2 + (dx / length) * bend + (dy / length) * shift;
    ctx.strokeStyle = card.line_color;
    ctx.fillStyle = card.line_color;
    ctx.lineWidth = card.line_weight;
    ctx.lineCap = "round";
    ctx.setLineDash(card.line_dashed ? [card.line_weight * 3, card.line_weight * 2.4] : []);
    const route = linePathData({
      start, end, bend, shift, routing: card.line_routing, sketchy: card.sketchy, seed: card.shape_seed,
    });
    ctx.stroke(new Path2D(route.d));
    ctx.setLineDash([]);
    const arrow = (tip: { x: number; y: number }, from: { x: number; y: number }) => {
      const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
      const size = 8 + card.line_weight * 1.5;
      const side = (a: number) => ({ x: tip.x - size * Math.cos(angle + a), y: tip.y - size * Math.sin(angle + a) });
      ctx.beginPath();
      if (card.line_arrow_style === "dot") {
        ctx.arc(tip.x - (size * Math.cos(angle)) / 2, tip.y - (size * Math.sin(angle)) / 2, size / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (card.line_arrow_style === "bar") {
        const a = { x: tip.x - Math.sin(angle) * size * 0.55, y: tip.y + Math.cos(angle) * size * 0.55 };
        const b = { x: tip.x + Math.sin(angle) * size * 0.55, y: tip.y - Math.cos(angle) * size * 0.55 };
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (card.line_arrow_style === "open") {
        const a = side(-0.5), b = side(0.5);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else {
        const a = side(-0.45), b = side(0.45);
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.closePath();
        ctx.fill();
      }
    };
    if (card.line_end_arrow) arrow(end, route.endFrom);
    if (card.line_start_arrow) arrow(start, route.startFrom);
    if (line(card.title)) {
      ctx.font = `600 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const mx = card.line_routing === "elbow" ? (start.x + end.x) / 2 + shift : (start.x + end.x) / 4 + cx / 2;
      const my = card.line_routing === "elbow" ? (start.y + end.y) / 2 : (start.y + end.y) / 4 + cy / 2;
      const text = line(card.title);
      const tw = ctx.measureText(text).width + 12;
      ctx.fillStyle = card.label_background ?? PAPER[board.background];
      ctx.fillRect(mx - tw / 2, my - 10, tw, 20);
      ctx.fillStyle = card.label_color ?? "#1d1d1b";
      ctx.fillText(text, mx, my);
      ctx.textAlign = "left";
    }
  }
  return { canvas, width, height };
}

// Only image-like cards carry a drawable picture.
function isImageSource(cards: BoardCard[], value: string) {
  return cards.some((card) => card.image === value && (card.kind === "image" || card.kind === "scene"));
}

// ---- PDF (one page, the rendered board as a JPEG) ----

export function canvasToPdf(canvas: HTMLCanvasElement, pageWidth: number, pageHeight: number, quality = 0.92): Blob {
  const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
  const binary = atob(base64);
  const jpeg = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) jpeg[i] = binary.charCodeAt(i);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const w = Math.round(pageWidth), h = Math.round(pageHeight);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  push("%PDF-1.4\n");
  offsets[1] = length; push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = length; push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets[3] = length;
  push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  offsets[5] = length;
  push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xref = length;
  push("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportRender = { canvas: HTMLCanvasElement; width: number; height: number };
export type ExportOptions = {
  ids?: string[];
  assetUrl: (path: string) => string;
  // 1-3. Pixels per canvas unit.
  scale?: number;
  // JPEG and PDF quality, 0-1.
  quality?: number;
  background?: CaptureBackground;
  // The open board's canvas, for an exact copy of what's on screen. Without it the board is redrawn.
  captureRoot?: HTMLElement | null;
};

// Draws the board for an image or PDF export: captured from the page when it is open, redrawn otherwise.
export async function renderExport(board: Board, options: ExportOptions): Promise<ExportRender> {
  const scale = options.scale ?? 2;
  if (options.captureRoot) {
    const allowed = options.ids?.length ? new Set(exportCards(board, options.ids).map((card) => card.id)) : undefined;
    return captureBoard({ root: options.captureRoot, allowed, scale, background: options.background ?? "board" });
  }
  return renderBoardCanvas(board, exportCards(board, options.ids), options.assetUrl, scale);
}

// Encodes a rendered board. JPEG and PDF can't hold transparency, so they are flattened onto white.
export async function encodeExport(format: "png" | "jpeg" | "pdf", rendered: ExportRender, quality = 0.92): Promise<Blob> {
  if (format === "png") {
    const blob = await toBlob(rendered.canvas, "image/png");
    if (!blob) throw new Error("This board is too large to export as an image. Try a lower resolution or PDF.");
    return blob;
  }
  const flat = flattenOnWhite(rendered.canvas);
  if (format === "pdf") return canvasToPdf(flat, rendered.width, rendered.height, quality);
  const blob = await toBlob(flat, "image/jpeg", quality);
  if (!blob) throw new Error("This board is too large to export as an image. Try a lower resolution or PDF.");
  return blob;
}

export async function exportBoardAs(board: Board, format: ExportFormat, options: ExportOptions) {
  const cards = exportCards(board, options.ids);
  const extension = EXPORT_FORMATS.find((item) => item.value === format)!.extension;
  const name = exportFileName(board, extension);
  if (format === "markdown") {
    saveBlob(new Blob([boardToMarkdown(board, cards)], { type: "text/markdown" }), name);
    return;
  }
  if (format === "json") {
    const data = options.ids?.length ? { ...board, cards, trash: [] } : board;
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), name);
    return;
  }
  const rendered = await renderExport(board, options);
  saveBlob(await encodeExport(format, rendered, options.quality), name);
}
