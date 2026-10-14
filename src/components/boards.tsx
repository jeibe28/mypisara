"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  Children,
  isValidElement,
  cloneElement,
  type ReactNode,
  type CSSProperties,
  useRef,
  useState,
  type PointerEvent,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Minus,
  ArrowLeft,
  CheckSquare,
  Copy,
  Download,
  ExternalLink,
  GripHorizontal,
  ImagePlus,
  Link2,
  PanelsTopLeft,
  Plus,
  Redo2,
  Search,
  StickyNote,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Folder,
  FolderPlus,
  FolderInput,
  Check,
  Columns3,
  FileText,
  Video,
  MonitorPlay,
  Lock,
  Unlock,
  ChevronsDownUp,
  ChevronsUpDown,
  Tag as TagIcon,
  Settings as SettingsIcon,
  RotateCcw,
  FolderOpen,
  Maximize2,
  Minimize2,
  Star,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  Pencil,
  Headphones,
  Palette,
  Shapes,
  LayoutPanelTop,
  ChevronDown,
  ChevronRight,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Type,
  Map as MapIcon,
  Upload,
  Keyboard,
  AlignStartVertical,
  AlignCenterVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  CopyPlus,
} from "lucide-react";
import Link from "next/link";
import { useApp } from "./app-context";
import { Button, Field, IconButton, Modal } from "./ui";
import { ShapeCard, ShapeToolbar } from "./board-shape";
import { ImageLibrary } from "./board-image-library";
import { CanvasPanel, CanvasRulers, DEFAULT_CANVAS_PREFS, readCanvasPrefs, saveCanvasPrefs, type CanvasPrefs } from "./board-canvas-settings";
import { SHAPES, linePathData, shapePath } from "@/lib/board-shapes";
import { AudioFileCard, CollapsedCard, EmbedCard, HeadingEditor, LinkCard, TodoCard } from "./board-card-content";
import { BoardSearchBar } from "./board-search";
import { EMBED_PROVIDERS, parseEmbed } from "@/lib/embeds";
import { parseBoardBackup } from "@/lib/board-export";
import { BOARD_TEMPLATES, boardFromTemplate, type TemplateId } from "@/lib/board-templates";
import { ExportDialog } from "./export-dialog";
import { useToast } from "./toast";
import {
  BOARD_STORAGE,
  boardSchema,
  boardCardSchema,
  cloneCards,
  stackColumns,
  columnInsertion,
  columnChildren,
  alignCards,
  boardPreview,
  COLUMN_MIN_WIDTH,
  clampBoardZoom,
  zoomBoardOffset,
  lightCardBackground,
  layerCard,
  trashCard,
  restoreCard,
  newBoard,
  newCard,
  validBoardImage,
  sanitizeBoardRichText,
  BOARD_ASSET_TYPES as BOARD_ASSET_TYPE_LIST,
  BOARD_DEMO_ASSET_MAX_BYTES,
  BOARD_DIRECT_UPLOAD_BYTES,
  BOARD_IMAGE_MAX_BYTES,
  boardAssetLimit,
  boardAssetLimitLabel,
  HEADING_FONTS,
  HEADING_SIZE_LABELS,
  HEADING_SIZE_PX,
  headingFontStyle,
  type Board,
  type BoardAlignment,
  type BoardCard,
  type BoardPreviewCard,
} from "@/lib/boards";

type Summary = Pick<
  Board,
  "id" | "title" | "revision" | "updated_at"
> & { card_count: number; preview?: BoardPreviewCard[] };
type Crumb = { id: string; title: string };
const TRAIL_KEY = "mypisara.board-trail";
function readTrail(): Crumb[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || "[]");
    return Array.isArray(value) ? value.filter((c) => typeof c?.id === "string" && typeof c?.title === "string") : [];
  } catch {
    return [];
  }
}
function writeTrail(trail: Crumb[]) {
  try {
    if (trail.length) sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail.slice(-8)));
    else sessionStorage.removeItem(TRAIL_KEY);
  } catch {
    /* Breadcrumbs are a convenience only. */
  }
}
function summarize(board: Board): Summary {
  return {
    id: board.id,
    title: board.title,
    revision: board.revision,
    updated_at: board.updated_at,
    card_count: board.cards.length,
    preview: boardPreview(board.cards),
  };
}
const labels: Record<BoardCard["kind"], string> = {
  note: "Note",
  image: "Image",
  link: "Link",
  checklist: "To-do",
  scene: "Image",
  group: "Heading",
  line: "Line",
  column: "Column",
  board: "Board",
  file: "File",
  video: "Video",
  color: "Color",
  video_link: "Video link",
  audio_link: "Audio link",
  shape: "Shape",
};
const icons = {
  note: StickyNote,
  image: ImagePlus,
  link: Link2,
  checklist: CheckSquare,
  scene: ImagePlus,
  group: Type,
  line: Minus,
  column: Columns3,
  board: LayoutPanelTop,
  file: FileText,
  video: Video,
  color: Palette,
  video_link: MonitorPlay,
  audio_link: Headphones,
  shape: Shapes,
};
const STRIP_COLORS = {
  Sage: "#9cbc83",
  Sand: "#d4b477",
  Blue: "#82b2d3",
  Rose: "#d48d99",
  Lilac: "#b49bce",
};
const NOTE_COLORS = {
  Sage: "#e8f0dd",
  Sand: "#f8edd6",
  Blue: "#e3effa",
  Rose: "#f8e4e8",
  Lilac: "#eee6fa",
  Charcoal: "#252a2e",
};
const LINE_COLORS = ["#202821", "#ffffff", "#9cbc83", "#82b2d3", "#d48d99", "#b49bce"];
type LineEnd = "start" | "end";
type Point = { x: number; y: number };
function cardHeight(card: BoardCard, root?: HTMLElement | null) {
  if (card.kind === "column" && card.collapsed) return 48;
  return (
    card.height ??
    root?.querySelector<HTMLElement>(`[data-card-id="${card.id}"]`)?.offsetHeight ??
    180
  );
}
// Natural aspect ratio of an image/video card plus the non-media height (header, title, actions),
// so resizing can keep the media undistorted. Null for cards without loaded media.
function mediaFrame(article: HTMLElement | null) {
  const media = article?.querySelector<HTMLImageElement | HTMLVideoElement>("img.board-card-image, video.board-card-video");
  if (!article || !media) return null;
  const w = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const h = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!w || !h) return null;
  return { ratio: w / h, chrome: Math.max(0, article.getBoundingClientRect().height - media.getBoundingClientRect().height) };
}
// What a deleted card looked like, small enough to recognise it at a glance in the trash.
function TrashCardPreview({ card }: { card: BoardCard }) {
  const Icon = icons[card.kind];
  const src = card.image ? boardAssetUrl(card.image) : "";
  const embed = card.kind === "video_link" || card.kind === "audio_link" ? parseEmbed(card.url, "") : null;
  const preview = card.link_preview?.url === card.url ? card.link_preview : null;
  const picture =
    card.kind === "image" || card.kind === "scene" ? src
    : card.kind === "link" ? src || preview?.image || ""
    : embed && embed.type === "iframe" ? embed.thumbnail || preview?.image || "" : "";
  let domain = "";
  try { domain = card.url ? new URL(card.url).hostname.replace(/^www\./, "") : ""; } catch { /* Not a URL. */ }
  if (picture)
    return <div className="trash-preview is-media"><img src={picture} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" /></div>;
  if (card.kind === "color")
    return <div className="trash-preview" style={{ background: card.color_value }}><span className="trash-chip">{card.color_value.toUpperCase()}</span></div>;
  if (card.kind === "group")
    return <div className="trash-preview is-text"><strong style={{ ...headingFontStyle(card), fontSize: "16px", textAlign: card.heading_align }}>{card.title || "Heading"}</strong></div>;
  if (card.kind === "checklist")
    return (
      <div className="trash-preview is-text">
        {card.tasks.slice(0, 4).map((task) => (
          <span key={task.id} className={`trash-task ${task.done ? "is-done" : ""}`}><i aria-hidden="true" />{task.text || "To-do"}</span>
        ))}
        {!card.tasks.length && <small>Empty list</small>}
        {card.tasks.length > 4 && <small>+{card.tasks.length - 4} more</small>}
      </div>
    );
  if (card.kind === "note") {
    const text = card.body.trim();
    return <div className="trash-preview is-text" style={card.background_color ? { background: card.background_color, color: "#1d1d1b" } : undefined}><p>{text || "Empty note"}</p></div>;
  }
  if (card.kind === "line")
    return <div className="trash-preview is-icon"><Minus size={26} style={{ color: card.line_color }} />{card.title && <span>{card.title}</span>}</div>;
  if (card.kind === "shape")
    return (
      <div className="trash-preview is-icon">
        <svg width="92" height="60" viewBox="0 0 92 60" aria-hidden="true">
          <path d={shapePath(card.shape, 92, 60, { sketchy: card.sketchy, seed: card.shape_seed, inset: 4 })}
            fill={card.shape === "highlight" ? card.line_color : card.background_color && SHAPES[card.shape].closed ? card.background_color : "none"}
            fillOpacity={card.shape === "highlight" ? 0.4 : undefined}
            stroke={card.shape === "highlight" ? "none" : card.line_color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {card.title && <span>{card.title}</span>}
      </div>
    );
  const detail =
    card.kind === "file" || card.kind === "video" ? [card.file_name, fileSize(card.file_size)].filter(Boolean).join(" · ")
    : card.kind === "link" || card.kind === "video_link" || card.kind === "audio_link" ? preview?.title || domain
    : card.kind === "column" ? "Column" : "";
  return <div className="trash-preview is-icon"><Icon size={26} />{detail && <span>{detail}</span>}</div>;
}
// A translucent stand-in for a card that is about to be dropped, drawn with the real card styling.
const GHOST_HEIGHT: Partial<Record<BoardCard["kind"], number>> = {
  note: 110, link: 150, image: 170, scene: 170, video: 170, file: 120, checklist: 120, group: 40,
  color: 110, column: 160, board: 130, video_link: 200, audio_link: 120, shape: 120,
};
function GhostCard({ kind, x, y, files = 0 }: { kind: BoardCard["kind"]; x: number; y: number; files?: number }) {
  const base = newCard(kind);
  const Icon = icons[kind];
  const height = GHOST_HEIGHT[kind] ?? 120;
  return (
    <div
      className={`board-ghost board-card board-card-${base.color} board-card-${kind} ${kind === "group" ? "board-heading-large" : ""}`}
      style={{ left: x, top: y, width: base.width, height }}
      aria-hidden="true"
    >
      {kind === "group" ? (
        <h2 className="board-heading-text">Heading</h2>
      ) : kind === "color" ? (
        <div className="board-color-swatch" style={{ background: base.color_value, minHeight: "100%" }} />
      ) : (
        <div className="board-ghost-body">
          {["image", "scene", "video", "video_link"].includes(kind) && <div className="board-ghost-media"><Icon size={26} /></div>}
          <div className="board-ghost-label"><Icon size={14} /><strong>{files > 1 ? `${files} files` : labels[kind]}</strong></div>
          {!["image", "scene", "video", "video_link", "audio_link"].includes(kind) && <><i /><i /><i className="is-short" /></>}
        </div>
      )}
    </div>
  );
}
// Width that fits a heading's text on one line. Headings that haven't been hand-resized follow it.
function headingWidth(card: BoardCard) {
  const font = HEADING_FONTS[card.heading_font] ?? HEADING_FONTS.sans;
  const size = HEADING_SIZE_PX[card.heading_size] * font.scale;
  const small = card.heading_size === "small";
  const lines = (card.title || "Heading").split("\n").map((text) => (small ? text.toUpperCase() : text));
  const ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (ctx) ctx.font = `${font.weight} ${size}px ${font.family}`;
  // The widest line decides the width; the others wrap under it.
  const measured = Math.max(...lines.map((shown) =>
    ctx ? ctx.measureText(shown).width + (small ? shown.length * size * 0.08 : 0) : shown.length * size * 0.6));
  return Math.round(Math.min(900, Math.max(120, measured + 28)));
}
function fitHeading(prev: BoardCard, next: BoardCard): BoardCard {
  if (next.kind !== "group" || (prev.title === next.title && prev.heading_size === next.heading_size && prev.heading_font === next.heading_font)) return next;
  const hugging = prev.width === 270 || Math.abs(prev.width - headingWidth(prev)) <= 2;
  // Height always follows the text, so the box never ends up shorter than its lines.
  return hugging ? { ...next, width: headingWidth(next), height: null } : { ...next, height: null };
}
function connectionPoint(
  connection: BoardCard["line_start_connection"],
  cards: BoardCard[],
  root?: HTMLElement | null,
): Point | null {
  if (!connection) return null;
  const card = cards.find((item) => item.id === connection.card_id && item.kind !== "line");
  if (!card) return null;
  const height = cardHeight(card, root);
  if (connection.edge === "top")
    return { x: card.x + card.width * connection.offset, y: card.y };
  if (connection.edge === "bottom")
    return { x: card.x + card.width * connection.offset, y: card.y + height };
  if (connection.edge === "left")
    return { x: card.x, y: card.y + height * connection.offset };
  return { x: card.x + card.width, y: card.y + height * connection.offset };
}
function linePoints(card: BoardCard, cards: BoardCard[], root?: HTMLElement | null) {
  const start = connectionPoint(card.line_start_connection, cards, root) ?? {
    x: card.line_start_x ?? card.x,
    y: card.line_start_y ?? card.y,
  };
  const end = connectionPoint(card.line_end_connection, cards, root) ?? {
    x: card.line_end_x ?? card.x + card.width,
    y: card.line_end_y ?? card.y + (card.height ?? 120),
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bend = card.line_bend ?? 0;
  const shift = card.line_shift ?? 0;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  // The control point can sit anywhere: across the line (bend) and along it (shift).
  const elbow = card.line_routing === "elbow";
  const control = elbow
    ? { x: mid.x + shift, y: mid.y }
    : {
        x: mid.x + (-dy / length) * bend + (dx / length) * shift,
        y: mid.y + (dx / length) * bend + (dy / length) * shift,
      };
  // The point where the curve itself passes at its middle. Handles and labels
  // sit here so they stay on the line and follow the pointer one to one.
  const apex = elbow ? { x: control.x, y: mid.y } : { x: (mid.x + control.x) / 2, y: (mid.y + control.y) / 2 };
  const pad = 28;
  const left = Math.max(0, Math.min(start.x, end.x, control.x) - pad);
  const top = Math.max(0, Math.min(start.y, end.y, control.y) - pad);
  const right = Math.max(start.x, end.x, control.x) + pad;
  const bottom = Math.max(start.y, end.y, control.y) + pad;
  return { start, end, control, apex, left, top, width: Math.max(56, right - left), height: Math.max(56, bottom - top) };
}
// Labels sit on the middle of the line, like a connector label. The label itself is the bend handle.
function lineLabelPosition(geometry: ReturnType<typeof linePoints>) {
  return { x: geometry.apex.x - geometry.left, y: geometry.apex.y - geometry.top };
}
function cardStyle(card: BoardCard): CSSProperties {
  return {
    ...(card.strip_color ? { "--card-accent": card.strip_color } : {}),
    ...(card.background_color
      ? {
          backgroundColor: card.background_color,
          "--surface": card.background_color,
          "--surface-2": lightCardBackground(card.background_color)
            ? "#0000000d"
            : "#ffffff12",
          "--button-text": lightCardBackground(card.background_color)
            ? "#202821"
            : "#f1f1e9",
          "--line": lightCardBackground(card.background_color)
            ? "#00000033"
            : "#ffffff33",
          "--text": lightCardBackground(card.background_color)
            ? "#202821"
            : "#f1f1e9",
          "--muted": lightCardBackground(card.background_color)
            ? "#48524a"
            : "#c5cdc7",
          "--faint": lightCardBackground(card.background_color)
            ? "#5b665e"
            : "#b5bdb7",
          "--line-soft": lightCardBackground(card.background_color)
            ? "#00000022"
            : "#ffffff22",
          "--surface-3": lightCardBackground(card.background_color)
            ? "#00000012"
            : "#ffffff15",
          color: lightCardBackground(card.background_color)
            ? "#202821"
            : "#f1f1e9",
        }
      : {}),
  } as CSSProperties;
}
function boardAssetUrl(value: string) {
  return value.startsWith("data:")
    ? value
    : `/api/assets?path=${encodeURIComponent(value)}`;
}
// "Saved just now" settles into "Saved 3 min ago" as time passes.
function savedLabel(savedAt: number, now: number) {
  const seconds = Math.max(0, Math.round(((now || Date.now()) - savedAt) / 1000));
  if (seconds < 45) return "Saved just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Saved ${minutes} min ago`;
  return `Saved ${Math.round(minutes / 60)} h ago`;
}
// Whether a card matches the search text and has every selected tag.
function cardMatches(card: BoardCard, query: string, tags: string[]) {
  if (tags.some((tag) => !card.tags.includes(tag))) return false;
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const haystack = [
    card.title, card.body, card.caption, card.url, card.file_name, card.link_preview?.title,
    card.link_preview?.description, ...card.tags, ...card.tasks.map((task) => `${task.text} ${task.assignee}`),
  ];
  return haystack.some((part) => part && part.toLowerCase().includes(text));
}
function fileSize(value: number) {
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function demoBoards(): Board[] {
  const saved = JSON.parse(localStorage.getItem(BOARD_STORAGE) || "[]");
  if (!Array.isArray(saved)) throw new Error("Saved boards could not be read.");
  return saved.map((b) => {
    const parsed = boardSchema.safeParse(b);
    if (!parsed.success)
      throw new Error("A board saved in this browser could not be read.");
    return parsed.data;
  });
}
// Demo-mode board trash lives in this browser and is purged after 30 days.
const DEMO_TRASH = "mypisara.boards.demo.trash.v1";
const TRASH_DAYS = 30;
type TrashedBoard = { id: string; title: string; revision: number; card_count: number; deleted_at: string; preview?: BoardPreviewCard[] };
function demoTrashRead(): { board: Board; deleted_at: string }[] {
  try {
    const list = JSON.parse(localStorage.getItem(DEMO_TRASH) || "[]");
    const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
    return (Array.isArray(list) ? list : []).filter(
      (item) => item?.board && boardSchema.safeParse(item.board).success && Date.parse(item.deleted_at) > cutoff,
    );
  } catch {
    return [];
  }
}
function demoTrashWrite(list: { board: Board; deleted_at: string }[]) {
  localStorage.setItem(DEMO_TRASH, JSON.stringify(list));
}
function demoMoveToTrash(id: string) {
  const all = demoBoards();
  const target = all.find((item) => item.id === id);
  if (!target) return;
  localStorage.setItem(BOARD_STORAGE, JSON.stringify(all.filter((item) => item.id !== id)));
  demoTrashWrite([{ board: target, deleted_at: new Date().toISOString() }, ...demoTrashRead()]);
}
function demoRestoreFromTrash(id: string) {
  const list = demoTrashRead();
  const hit = list.find((item) => item.board.id === id);
  if (!hit) return;
  demoTrashWrite(list.filter((item) => item.board.id !== id));
  localStorage.setItem(BOARD_STORAGE, JSON.stringify([hit.board, ...demoBoards()]));
}
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Unable to save board.");
  return result;
}
const TOOL_MIME = "application/x-mypisara-card-kind";
// The rail is grouped by intent: write, bring media in, organize, then style.
const TOOL_GROUPS: { name: string; kinds: BoardCard["kind"][] }[] = [
  { name: "Write", kinds: ["note", "group", "checklist"] },
  { name: "Media", kinds: ["image", "video_link", "audio_link", "link"] },
  { name: "Structure", kinds: ["column", "board", "line"] },
  { name: "Style", kinds: ["color", "shape"] },
];
const TOOL_KEYS: Partial<Record<BoardCard["kind"], string>> = {
  note: "N", group: "H", checklist: "T", image: "I", video_link: "V", audio_link: "A",
  link: "L", column: "C", board: "B", line: "-", color: "P", shape: "S",
};
// Short names fit the narrow rail; the full name stays in the tooltip and label.
const TOOL_SHORT: Partial<Record<BoardCard["kind"], string>> = { video_link: "Video", audio_link: "Audio" };
const CLIPBOARD_TAG = "mypisara-board-card-v1";
const EXPAND_HEIGHT: Partial<Record<BoardCard["kind"], number>> = { link: 215, video_link: 290, audio_link: 290 };
const LINK_PREVIEW_KINDS: BoardCard["kind"][] = ["link", "video_link", "audio_link"];
const BOARD_ASSET_TYPES = new Set(BOARD_ASSET_TYPE_LIST);
let uploadPrefix: Promise<string> | null = null;
// The folder this account's files live in; direct uploads must name it.
function accountUploadPrefix() {
  uploadPrefix ??= fetch("/api/assets?prefix=1", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Sign in to upload files."))))
    .then((data: { prefix: string }) => data.prefix)
    .catch((error) => { uploadPrefix = null; throw error; });
  return uploadPrefix;
}
// onProgress receives 0..1 as the file is read or sent.
async function uploadBoardAsset(file: File, demo: boolean, onProgress?: (fraction: number) => void): Promise<string> {
  const limit = demo ? BOARD_DEMO_ASSET_MAX_BYTES : boardAssetLimit(file.type);
  if (!BOARD_ASSET_TYPES.has(file.type)) {
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : file.type || "unknown";
    throw new Error(`${file.name}: .${ext} files aren't supported. Use an image, PDF, video, audio, text, ZIP, or DOCX file.`);
  }
  if (file.size > limit)
    throw new Error(`${file.name} is ${(file.size / 1_048_576).toFixed(1)} MB; the limit is ${demo ? "500 KB" : boardAssetLimitLabel(file.type)}${demo ? "" : file.type.startsWith("image/") ? " for images" : " for this file type"}.`);
  if (demo) {
    const asset = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
    if (!validBoardImage(asset)) throw new Error("Invalid board file.");
    return asset;
  }
  if (file.size > BOARD_DIRECT_UPLOAD_BYTES) {
    // Big files go straight to storage; the server only hands out a short-lived permission for this file.
    // Check the account's space first: a refused permission only reaches the browser as a generic error.
    const usage = await fetch("/api/assets?usage=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null) as Promise<{ used: number; quota: number; error: string } | null>)
      .catch(() => null);
    if (usage && usage.used + file.size > usage.quota) throw new Error(usage.error);
    const { upload } = await import("@vercel/blob/client");
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || file.type.split("/")[1];
    const result = await upload(`${await accountUploadPrefix()}asset.${extension}`, file, {
      access: "private",
      handleUploadUrl: "/api/assets",
      clientPayload: JSON.stringify({ type: file.type, size: file.size }),
      contentType: file.type,
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (event) => onProgress?.(event.percentage / 100),
    });
    onProgress?.(1);
    return result.pathname;
  }
  const form = new FormData();
  form.set("file", file);
  // XMLHttpRequest, because fetch can't report how much of a request body has been sent.
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/assets");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.onload = () => {
      let data: { path?: string; error?: string } = {};
      try { data = JSON.parse(request.responseText); } catch { /* Fall through to the generic message. */ }
      if (request.status >= 200 && request.status < 300 && data.path) {
        onProgress?.(1);
        resolve(data.path);
      } else reject(new Error(data.error || "Upload failed. Try again."));
    };
    request.send(form);
  });
}
// Hex entry that only commits a complete #RRGGBB value, so typing never flickers the swatch.
function HexField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value.toUpperCase());
  useEffect(() => setText(value.toUpperCase()), [value]);
  return (
    <input
      className="board-hex-field"
      aria-label="Hex color"
      spellCheck={false}
      maxLength={7}
      value={text}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
        setText(next.toUpperCase());
        if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase());
      }}
      onBlur={() => setText(value.toUpperCase())}
    />
  );
}
type PendingUpload = {
  id: string;
  file: File;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  preview: string | null;
  stage: "preparing" | "uploading" | "error";
  error: string;
  // 0..1 while the file is being sent.
  progress: number;
};
// Shrinks big photos and screenshots before upload so they fit the size limit, and reads the
// image's proportions so its card can match. GIF/SVG pass through untouched to keep animation.
async function prepareUpload(file: File, demo: boolean): Promise<{ file: File; ratio: number | null; naturalWidth: number }> {
  const limit = demo ? BOARD_DEMO_ASSET_MAX_BYTES : BOARD_IMAGE_MAX_BYTES;
  const heic = /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  const raster = file.type.startsWith("image/") && file.type !== "image/svg+xml" && file.type !== "image/gif";
  if (!raster && !heic) return { file, ratio: null, naturalWidth: 0 };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (heic) throw new Error(`${file.name} is a HEIC photo this browser can't convert. Export it as JPG and try again.`);
    return { file, ratio: null, naturalWidth: 0 };
  }
  // Cut away transparent margins so a logo or cut-out sits tight on the canvas, with no invisible padding.
  let crop = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  if (/^image\/(png|webp)$/.test(file.type) && Math.max(bitmap.width, bitmap.height) <= 4096) {
    const probe = document.createElement("canvas");
    probe.width = bitmap.width;
    probe.height = bitmap.height;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    if (probeCtx) {
      probeCtx.drawImage(bitmap, 0, 0);
      const { data } = probeCtx.getImageData(0, 0, bitmap.width, bitmap.height);
      let minX = bitmap.width, minY = bitmap.height, maxX = -1, maxY = -1;
      for (let y = 0; y < bitmap.height; y++)
        for (let x = 0; x < bitmap.width; x++)
          if (data[(y * bitmap.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
      const trimsSomething = maxX >= 0 && (minX > 0 || minY > 0 || maxX < bitmap.width - 1 || maxY < bitmap.height - 1);
      if (trimsSomething) crop = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
  }
  const trimmed = crop.w < bitmap.width || crop.h < bitmap.height;
  const ratio = crop.w / crop.h;
  const naturalWidth = crop.w;
  const oversized = file.size > Math.min(limit, 1_500_000) || Math.max(crop.w, crop.h) > 2400;
  if (!heic && !oversized && !trimmed) {
    bitmap.close();
    return { file, ratio, naturalWidth };
  }
  let best: File | null = null;
  for (const [edge, quality] of [[2400, 0.85], [1600, 0.75], [1200, 0.6], [800, 0.5]]) {
    const scale = Math.min(1, edge / Math.max(crop.w, crop.h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.w * scale));
    canvas.height = Math.max(1, Math.round(crop.h * scale));
    canvas.getContext("2d")!.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", quality));
    if (!blob) continue;
    best = new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.webp`, { type: "image/webp" });
    if (best.size <= limit) break;
  }
  bitmap.close();
  // Re-encoding can grow already-optimised files; keep the original when it fits.
  if (!best || (!heic && !trimmed && file.size <= limit && best.size >= file.size)) return { file, ratio, naturalWidth };
  return { file: best, ratio, naturalWidth };
}
async function uploadBoardImage(file: File, demo: boolean, onProgress?: (fraction: number) => void): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error("Choose a PNG, JPG, WebP, or GIF image.");
  return uploadBoardAsset(file, demo, onProgress);
}
function download(board: Board) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(board, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${board.title.replace(/[^a-z0-9]/gi, "-") || "board"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Boards({ detailId }: { detailId?: string }) {
  const { demo, go, user, href, dashboard } = useApp();
  const [boards, setBoards] = useState<Summary[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<"recent" | "name" | "cards">("recent");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [favorites, setFavorites] = useState<string[]>([]);
  // Folders for organising boards. A board is in at most one folder.
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [boardFolders, setBoardFolders] = useState<Record<string, string>>({});
  const [folder, setFolder] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [folderDialog, setFolderDialog] = useState<{ id?: string; name: string } | null>(null);
  const [organize, setOrganize] = useState<{ ids: string[]; copy: boolean } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  // Which sidebar entry a dragged board is hovering over (a folder id, or "all").
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<{ id: string; name: string } | null>(null);
  const [tileMenu, setTileMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<Summary | null>(null);
  const [exporting, setExporting] = useState<Board | null>(null);
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<"all" | "favorites" | "trash">("all");
  const [trashed, setTrashed] = useState<TrashedBoard[]>([]);
  const [template, setTemplate] = useState<TemplateId>("blank");
  const [purging, setPurging] = useState<TrashedBoard | null>(null);
  const [emptying, setEmptying] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (create) setTemplate("blank"); }, [create]);
  const toast = useToast();
  useEffect(() => {
    if (!notice) return;
    toast(notice);
    setNotice("");
  }, [notice, toast]);
  // Sort, layout and favorites are remembered on this device.
  useEffect(() => {
    try {
      // The account's saved copy wins; a device with its own settings and no
      // account copy yet uploads them once.
      const local = JSON.parse(localStorage.getItem("mypisara:dashboard") || "{}");
      // The account's copy wins, except for folders when the account can't store them yet: those stay as saved here.
      const saved = dashboard
        ? { ...local, ...dashboard, folders: dashboard.folders ?? local.folders, board_folders: dashboard.board_folders ?? local.board_folders }
        : local;
      if (dashboard) localStorage.setItem("mypisara:dashboard", JSON.stringify(saved));
      else if (!demo && user && (local.favorites?.length || local.sort || local.layout))
        void fetch("/api/preferences/dashboard", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            favorites: Array.isArray(local.favorites) ? local.favorites : [],
            sort: ["recent", "name", "cards"].includes(local.sort) ? local.sort : "recent",
            layout: ["grid", "list"].includes(local.layout) ? local.layout : "grid",
            folders: Array.isArray(local.folders) ? local.folders : [],
            board_folders: local.board_folders && typeof local.board_folders === "object" ? local.board_folders : {},
          }),
        }).catch(() => undefined);
      if (["recent", "name", "cards"].includes(saved.sort)) setSort(saved.sort);
      if (["grid", "list"].includes(saved.layout)) setLayout(saved.layout);
      if (Array.isArray(saved.favorites)) setFavorites(saved.favorites.filter((id: unknown) => typeof id === "string"));
      const savedFolders: { id: string; name: string }[] = Array.isArray(saved.folders)
        ? saved.folders.filter((item: { id?: unknown; name?: unknown }) => typeof item?.id === "string" && typeof item?.name === "string")
        : [];
      setFolders(savedFolders);
      if (saved.board_folders && typeof saved.board_folders === "object" && !Array.isArray(saved.board_folders))
        setBoardFolders(Object.fromEntries(Object.entries(saved.board_folders as Record<string, unknown>)
          .filter(([, target]) => typeof target === "string" && savedFolders.some((item) => item.id === target)) as [string, string][]));
    } catch { /* Start with defaults. */ }
  }, []);
  function remember(next: {
    sort?: typeof sort;
    layout?: typeof layout;
    favorites?: string[];
    folders?: typeof folders;
    board_folders?: typeof boardFolders;
  }) {
    const value = { sort, layout, favorites, folders, board_folders: boardFolders, ...next };
    if (next.sort) setSort(next.sort);
    if (next.layout) setLayout(next.layout);
    if (next.favorites) setFavorites(next.favorites);
    if (next.folders) setFolders(next.folders);
    if (next.board_folders) setBoardFolders(next.board_folders);
    try { localStorage.setItem("mypisara:dashboard", JSON.stringify(value)); } catch { /* Optional. */ }
    if (!demo && user)
      void fetch("/api/preferences/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.folders_saved === false && (value.folders.length || Object.keys(value.board_folders).length)
            && !sessionStorage.getItem("mypisara:folders-local-notice")) {
            sessionStorage.setItem("mypisara:folders-local-notice", "1");
            setNotice("Folders are saved on this device for now. They'll sync to your account once the database is updated.");
          }
        })
        .catch(() => undefined);
  }
  const toggleFavorite = (id: string) =>
    remember({ favorites: favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id] });
  const fetchBoard = async (id: string) =>
    boardSchema.parse(
      demo
        ? demoBoards().find((item) => item.id === id)
        : await api(`/api/boards?id=${encodeURIComponent(id)}`),
    );
  async function saveNewBoard(b: Board) {
    if (demo) {
      b.revision = 1;
      localStorage.setItem(BOARD_STORAGE, JSON.stringify([b, ...demoBoards()]));
    } else
      Object.assign(b, await api("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      }));
    return b;
  }
  async function task(work: () => Promise<void>) {
    setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
  }
  const folderName = (id: string) => folders.find((item) => item.id === id)?.name ?? "";
  // Moving changes a board's folder; copying duplicates the board into the folder.
  function moveBoards(ids: string[], target: string | null, nextFolders = folders) {
    const map = { ...boardFolders };
    for (const id of ids) {
      if (target) map[id] = target;
      else delete map[id];
    }
    remember({ folders: nextFolders, board_folders: map });
    setNotice(
      `${ids.length === 1 ? "Board" : `${ids.length} boards`} moved ${target ? `to “${nextFolders.find((item) => item.id === target)?.name}”` : "out of its folder"}.`,
    );
  }
  const copyBoards = (ids: string[], target: string | null, nextFolders = folders) => task(async () => {
    const map = { ...boardFolders };
    for (const id of ids) {
      const source = await fetchBoard(id);
      const copy = await saveNewBoard({
        ...source, id: crypto.randomUUID(), title: `${source.title} copy`.slice(0, 200), revision: 0, updated_at: new Date().toISOString(),
      });
      if (target) map[copy.id] = target;
    }
    remember({ folders: nextFolders, board_folders: map });
    setNotice(
      `${ids.length === 1 ? "Board" : `${ids.length} boards`} copied${target ? ` to “${nextFolders.find((item) => item.id === target)?.name}”` : ""}.`,
    );
    await load();
  });
  function finishOrganize(target: string | null, nextFolders = folders) {
    if (!organize) return;
    if (organize.copy) void copyBoards(organize.ids, target, nextFolders);
    else moveBoards(organize.ids, target, nextFolders);
    setOrganize(null);
    setSelecting(false);
    setPicked([]);
  }
  function saveFolder(name: string, id?: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    if (id) remember({ folders: folders.map((item) => (item.id === id ? { ...item, name: clean } : item)) });
    else {
      const created = { id: crypto.randomUUID(), name: clean };
      remember({ folders: [...folders, created] });
      setSection("all");
      setFolder(created.id);
    }
  }
  function deleteFolder(id: string) {
    const map = Object.fromEntries(Object.entries(boardFolders).filter(([, target]) => target !== id));
    remember({ folders: folders.filter((item) => item.id !== id), board_folders: map });
    if (folder === id) setFolder(null);
    setNotice("Folder deleted. Its boards are still in All boards.");
  }
  const duplicateBoard = (id: string) => task(async () => {
    const source = await fetchBoard(id);
    await saveNewBoard({ ...source, id: crypto.randomUUID(), title: `${source.title} copy`.slice(0, 200), revision: 0, updated_at: new Date().toISOString() });
    setNotice(`Duplicated “${source.title}”.`);
    await load();
  });
  const renameBoard = (id: string, next: string) => task(async () => {
    const source = await fetchBoard(id);
    if (demo)
      localStorage.setItem(BOARD_STORAGE, JSON.stringify(demoBoards().map((item) =>
        item.id === id ? { ...item, title: next, revision: item.revision + 1, updated_at: new Date().toISOString() } : item)));
    else
      await api("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...source, title: next }),
      });
    await load();
  });
  const restoreBoard = (id: string) => task(async () => {
    if (demo) demoRestoreFromTrash(id);
    else
      await api("/api/boards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "restore" }),
      });
    await load();
  });
  const removeBoard = (item: Summary) => task(async () => {
    if (demo) demoMoveToTrash(item.id);
    else
      await api("/api/boards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, revision: item.revision }),
      });
    setDeleting(null);
    await load();
    toast(`Moved “${item.title}” to trash`, { action: { label: "Undo", run: () => void restoreBoard(item.id) } });
  });
  const purgeBoard = (item: TrashedBoard) => task(async () => {
    if (demo) demoTrashWrite(demoTrashRead().filter((entry) => entry.board.id !== item.id));
    else
      await api("/api/boards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, revision: item.revision, permanent: true }),
      });
    remember({
      favorites: favorites.filter((id) => id !== item.id),
      board_folders: Object.fromEntries(Object.entries(boardFolders).filter(([board]) => board !== item.id)),
    });
    setPurging(null);
    await load();
  });
  const emptyTrash = () => task(async () => {
    const items = [...trashed];
    if (demo) demoTrashWrite([]);
    else
      for (const item of items)
        await api("/api/boards", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, revision: item.revision, permanent: true }),
        });
    remember({
      favorites: favorites.filter((id) => !items.some((item) => item.id === id)),
      board_folders: Object.fromEntries(Object.entries(boardFolders).filter(([board]) => !items.some((item) => item.id === board))),
    });
    setEmptying(false);
    await load();
    toast(items.length === 1 ? "Trash emptied" : `Trash emptied · ${items.length} boards deleted`);
  });
  const openExport = (id: string) => task(async () => setExporting(await fetchBoard(id)));
  const importBackup = (file?: File) => task(async () => {
    if (!file) return;
    const { board: imported, droppedFiles } = parseBoardBackup(await file.text(), demo ? undefined : user?.id);
    await saveNewBoard(boardSchema.parse(imported));
    setNotice(droppedFiles
      ? `Imported “${imported.title}”. ${droppedFiles} attached ${droppedFiles === 1 ? "file" : "files"} couldn't be restored.`
      : `Imported “${imported.title}”.`);
    await load();
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (detailId) {
        const result = demo
          ? demoBoards().find((b) => b.id === detailId)
          : await api(`/api/boards?id=${encodeURIComponent(detailId)}`);
        if (!result) throw new Error("Board not found.");
        setBoard(boardSchema.parse(result));
      } else {
        setBoard(null);
        setBoards(demo ? demoBoards().map(summarize) : await api("/api/boards"));
        try {
          setTrashed(
            demo
              ? demoTrashRead().map(({ board: b, deleted_at }) => ({
                  id: b.id, title: b.title, revision: b.revision, card_count: b.cards.length, deleted_at,
                  preview: boardPreview(b.cards),
                }))
              : await api("/api/boards?trash=1"),
          );
        } catch {
          setTrashed([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load boards.");
    } finally {
      setLoading(false);
    }
  }, [detailId, demo]);
  useEffect(() => {
    void load();
  }, [load]);
  async function createBoard() {
    setBusy(true);
    setError("");
    try {
      const b = boardSchema.parse(boardFromTemplate(template, title.trim()));
      if (demo) {
        b.revision = 1;
        localStorage.setItem(BOARD_STORAGE, JSON.stringify([b, ...demoBoards()]));
      } else
        Object.assign(
          b,
          await api("/api/boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(b),
          }),
        );
      if (folder) remember({ board_folders: { ...boardFolders, [b.id]: folder } });
      setCreate(false);
      writeTrail([]);
      go(`/boards/${b.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create board.");
    } finally {
      setBusy(false);
    }
  }
  if (detailId && board && !loading)
    return <BoardEditor key={board.id} initial={board} onReload={load} />;
  const shown = boards
    .filter((b) => b.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        : sort === "cards"
          ? b.card_count - a.card_count || b.updated_at.localeCompare(a.updated_at)
          : b.updated_at.localeCompare(a.updated_at),
    );
  const starred = shown.filter((b) => favorites.includes(b.id));
  const others = shown.filter((b) => !favorites.includes(b.id));
  const inFolder = folder ? shown.filter((b) => boardFolders[b.id] === folder) : shown;
  const visible = folder ? inFolder : section === "favorites" ? starred : shown;
  const openFolder = folder ? folders.find((item) => item.id === folder) : undefined;
  const togglePick = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  const BOARD_DRAG = "application/x-mypisara-boards";
  // Drop targets in the sidebar: a folder files the boards there; "All boards" takes them out of their folder.
  const dropTarget = (key: string, target: string | null) => ({
    "data-drop": dropOver === key ? "true" : undefined,
    onDragEnter: (e: DragEvent) => { if (e.dataTransfer.types.includes(BOARD_DRAG)) { e.preventDefault(); setDropOver(key); } },
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(BOARD_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropOver((current) => (current === key ? null : current));
    },
    onDrop: (e: DragEvent) => {
      const raw = e.dataTransfer.getData(BOARD_DRAG);
      setDropOver(null);
      if (!raw) return;
      e.preventDefault();
      try {
        const ids = (JSON.parse(raw) as unknown[]).filter((id): id is string => typeof id === "string");
        if (ids.length) {
          moveBoards(ids, target);
          if (selecting) { setPicked([]); setSelecting(false); }
        }
      } catch { /* Not one of ours. */ }
    },
  });
  const daysLeft = (iso: string) =>
    Math.max(0, TRASH_DAYS - Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  const openBoardFromLibrary = (id: string) => {
    writeTrail([]);
    go(`/boards/${id}`);
  };
  const tiles = (list: Summary[]) => (
    <div className={`boards-grid ${layout === "list" ? "is-list" : ""}`}>
      {list.map((b) => {
        const starredNow = favorites.includes(b.id);
        return (
          <div
            key={b.id}
            className="board-tile"
            draggable
            onDragStart={(e) => {
              // Dragging a selected board moves the whole selection; otherwise just this board.
              const ids = selecting && picked.includes(b.id) ? picked : [b.id];
              e.dataTransfer.setData(BOARD_DRAG, JSON.stringify(ids));
              e.dataTransfer.setData("text/plain", ids.length === 1 ? b.title : `${ids.length} boards`);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDropOver(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTileMenu({ x: e.clientX, y: e.clientY, id: b.id });
            }}
          >
            <button
              className="board-preview"
              aria-pressed={selecting ? picked.includes(b.id) : undefined}
              data-picked={selecting && picked.includes(b.id) ? "true" : undefined}
              onClick={() => (selecting ? togglePick(b.id) : openBoardFromLibrary(b.id))}
            >
              <BoardThumbnail cards={b.preview} />
              <div className="board-preview-info">
                <h2>{b.title}</h2>
                <p>
                  {b.card_count} {b.card_count === 1 ? "card" : "cards"} <span>·</span>{" "}
                  {new Date(b.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
                {!folder && boardFolders[b.id] && folderName(boardFolders[b.id]) && (
                  <span className="board-folder-chip"><Folder size={11} />{folderName(boardFolders[b.id])}</span>
                )}
              </div>
            </button>
            {selecting && (
              <span className="board-tile-check" data-on={picked.includes(b.id) ? "true" : "false"} aria-hidden="true">
                <Check size={14} />
              </span>
            )}
            <div className="board-tile-actions">
              <button
                aria-label={starredNow ? `Remove ${b.title} from favorites` : `Add ${b.title} to favorites`}
                aria-pressed={starredNow}
                title={starredNow ? "Remove from favorites" : "Add to favorites"}
                onClick={() => toggleFavorite(b.id)}
              >
                <Star size={15} fill={starredNow ? "currentColor" : "none"} />
              </button>
              <button
                aria-label={`Actions for ${b.title}`}
                aria-haspopup="menu"
                title="Board actions"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTileMenu({ x: rect.right - 220, y: rect.bottom + 6, id: b.id });
                }}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
  const menuBoard = tileMenu ? boards.find((b) => b.id === tileMenu.id) : undefined;
  const firstName = user?.name?.split(" ")[0];
  return (
    <div className="library-layout">
    <nav className="library-nav" aria-label="Library">
      {([
        ["all", "All boards", boards.length, LayoutGrid],
        ["favorites", "Favorites", boards.filter((b) => favorites.includes(b.id)).length, Star],
        ["trash", "Trash", trashed.length, Trash2],
      ] as const).map(([id, label, count, Icon]) => (
        <button
          key={id}
          aria-current={section === id && !(id === "all" && folder) ? "page" : undefined}
          onClick={() => { setSection(id); setFolder(null); setSelecting(false); setPicked([]); }}
          {...(id === "all" ? dropTarget("all", null) : {})}
        >
          <Icon size={16} />
          <span>{label}</span>
          {count > 0 && <b>{count}</b>}
        </button>
      ))}
      <div className="library-folders" role="group" aria-label="Folders">
        <div className="library-folders-head">
          <span>Folders</span>
          <button className="library-folder-add" aria-label="New folder" title="New folder" onClick={() => setFolderDialog({ name: "" })}>
            <FolderPlus size={15} />
          </button>
        </div>
        {folders.map((item) => (
          <button
            key={item.id}
            aria-current={section === "all" && folder === item.id ? "page" : undefined}
            onClick={() => { setSection("all"); setFolder(item.id); setSelecting(false); setPicked([]); }}
            {...dropTarget(item.id, item.id)}
          >
            {folder === item.id ? <FolderOpen size={16} /> : <Folder size={16} />}
            <span>{item.name}</span>
            {boards.filter((b) => boardFolders[b.id] === item.id).length > 0 && (
              <b>{boards.filter((b) => boardFolders[b.id] === item.id).length}</b>
            )}
          </button>
        ))}
        {!folders.length && <p className="library-folders-empty">Create a folder to group related boards.</p>}
      </div>
      <Link className="library-nav-link" href={href("/settings")}>
        <SettingsIcon size={16} />
        <span>Settings</span>
      </Link>
    </nav>
    <section className="boards-page library-main">
      <div className="boards-heading">
        <div>
          <span className="boards-eyebrow">{firstName ? `Welcome back, ${firstName}` : "Your visual workspace"}</span>
          <h1>{openFolder ? openFolder.name : section === "trash" ? "Trash" : section === "favorites" ? "Favorites" : "Boards"}</h1>
          <p>
            {openFolder
              ? `${inFolder.length} ${inFolder.length === 1 ? "board" : "boards"} in this folder.`
              : section === "trash"
              ? `Deleted boards stay here for ${TRASH_DAYS} days, then are removed for good.`
              : section === "favorites"
                ? "Your starred boards."
                : "Collect ideas, sketch plans, and see everything at once."}
          </p>
        </div>
        <div className="boards-heading-actions">
          {openFolder && (
            <>
              <Button onClick={() => setFolderDialog({ id: openFolder.id, name: openFolder.name })}>
                <Pencil size={15} />
                Rename
              </Button>
              <Button variant="danger" onClick={() => setDeletingFolder(openFolder)}>
                <Trash2 size={15} />
                Delete folder
              </Button>
            </>
          )}
          {section === "trash" && trashed.length > 0 && (
            <Button variant="danger" onClick={() => setEmptying(true)}>
              <Trash2 size={16} />
              Empty trash
            </Button>
          )}
          <Button onClick={() => importInput.current?.click()}>
            <Upload size={16} />
            Import
          </Button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Import a board backup"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void importBackup(file);
            }}
          />
          <Button
            variant="primary"
            onClick={() => {
              setTitle("");
              setCreate(true);
            }}
          >
            <Plus size={17} />
            New board
          </Button>
        </div>
      </div>
      {boards.length > 0 && section !== "trash" && (
        <div className="boards-filters">
          <label className="boards-search">
            <Search size={16} />
            <input
              aria-label="Search boards"
              placeholder="Search boards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="boards-controls">
            <button
              className={`btn board-select-toggle ${selecting ? "is-on" : ""}`}
              aria-pressed={selecting}
              onClick={() => { setSelecting((on) => !on); setPicked([]); }}
            >
              <Check size={15} />
              Select
            </button>
            <label className="board-project-filter">
              <span className="sr-only">Sort boards</span>
              <select aria-label="Sort boards" value={sort} onChange={(e) => remember({ sort: e.target.value as typeof sort })}>
                <option value="recent">Recently edited</option>
                <option value="name">Name A–Z</option>
                <option value="cards">Most cards</option>
              </select>
            </label>
            <div className="board-view-switch" role="group" aria-label="Layout">
              <button aria-label="Grid view" aria-pressed={layout === "grid"} className={layout === "grid" ? "active" : ""} onClick={() => remember({ layout: "grid" })}><LayoutGrid size={14} /></button>
              <button aria-label="List view" aria-pressed={layout === "list"} className={layout === "list" ? "active" : ""} onClick={() => remember({ layout: "list" })}><ListIcon size={14} /></button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="board-error" role="alert">
          {error}
          <Button onClick={load}>Retry</Button>
        </div>
      )}
      {loading ? (
        <div className="boards-grid" role="status" aria-label="Loading your boards">
          {[0, 1, 2, 3].map((i) => (
            <div className="board-skeleton" key={i} aria-hidden="true">
              <div className="skeleton board-skeleton-art" />
              <div className="board-skeleton-info">
                <div className="skeleton" style={{ width: "62%", height: 16 }} />
                <div className="skeleton" style={{ width: "38%", height: 11 }} />
              </div>
            </div>
          ))}
        </div>
      ) : section === "trash" ? (
        trashed.length ? (
          <ul className="trash-list" aria-label="Deleted boards">
            {trashed.map((item) => (
              <li key={item.id}>
                <div className="trash-thumb"><BoardThumbnail cards={item.preview} /></div>
                <div className="trash-info">
                  <strong>{item.title}</strong>
                  <small>
                    {item.card_count} {item.card_count === 1 ? "card" : "cards"} · deleted{" "}
                    {new Date(item.deleted_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                    {daysLeft(item.deleted_at)} days left
                  </small>
                </div>
                <Button onClick={() => void restoreBoard(item.id)}>
                  <RotateCcw size={14} />
                  Restore
                </Button>
                <Button variant="danger" onClick={() => setPurging(item)}>
                  Delete forever
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="board-empty">
            <div className="board-empty-icon"><Trash2 size={32} /></div>
            <h2>Trash is empty</h2>
            <p>Boards you delete land here and can be restored for {TRASH_DAYS} days.</p>
          </div>
        )
      ) : !visible.length ? (
        <div className="board-empty">
          <div className="board-empty-icon">
            <PanelsTopLeft size={36} />
          </div>
          <h2>
            {search
              ? "No matching boards"
              : openFolder
                ? "This folder is empty"
                : section === "favorites"
                ? "No favorites yet"
                : "A blank board is a good start"}
          </h2>
          <p>
            {search
              ? "Try a different search."
              : openFolder
                ? "Use Select to move boards here, or create a new board in this folder."
                : section === "favorites"
                ? "Star a board to keep it close at hand."
                : "Drop in notes, images, links and to-dos, then arrange them your way."}
          </p>
          {!search && section === "all" && (
            <Button variant="primary" onClick={() => setCreate(true)}>
              <Plus size={16} />
              Create your first board
            </Button>
          )}
        </div>
      ) : (
        <>
          {!folder && section === "all" && starred.length > 0 && !search && <h2 className="boards-section-title">Favorites</h2>}
          {!folder && section === "all" && !search && starred.length > 0 ? tiles(starred) : null}
          {!folder && section === "all" && starred.length > 0 && !search && others.length > 0 && <h2 className="boards-section-title">All boards</h2>}
          {tiles(folder ? inFolder : section === "favorites" ? starred : search ? shown : others)}
        </>
      )}
      {create && (
        <Modal
          title="Create a board"
          description="Pick a starting point."
          onClose={() => !busy && setCreate(false)}
        >
          <form
            className="board-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createBoard();
            }}
          >
            <div role="radiogroup" aria-label="Template" className="template-grid">
              {BOARD_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={template === item.id}
                  className="choice template-choice"
                  onClick={() => setTemplate(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </div>
            <Field label="Board name">
              <input
                autoFocus
                required
                maxLength={200}
                placeholder={BOARD_TEMPLATES.find((item) => item.id === template)?.placeholder}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="board-error">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
              {busy ? "Creating…" : "Create board"}
            </Button>
          </form>
        </Modal>
      )}
      {tileMenu && menuBoard && (
        <BoardContextMenu
          x={tileMenu.x}
          y={tileMenu.y}
          label={`Actions for ${menuBoard.title}`}
          onClose={() => setTileMenu(null)}
          actions={[
            { label: "Open", run: () => openBoardFromLibrary(menuBoard.id) },
            {
              label: "Open in new tab",
              run: () => { window.open(`${demo ? "/demo" : ""}/boards/${menuBoard.id}`, "_blank", "noopener"); },
            },
            { label: "Rename", run: () => setRenaming({ id: menuBoard.id, title: menuBoard.title }) },
            { label: "Duplicate", run: () => void duplicateBoard(menuBoard.id) },
            { label: "Move to folder…", run: () => setOrganize({ ids: [menuBoard.id], copy: false }) },
            { label: "Copy to folder…", run: () => setOrganize({ ids: [menuBoard.id], copy: true }) },
            {
              label: favorites.includes(menuBoard.id) ? "Remove from favorites" : "Add to favorites",
              run: () => toggleFavorite(menuBoard.id),
            },
            { label: "Export…", run: () => void openExport(menuBoard.id) },
            {
              label: "Copy link",
              run: () => {
                const link = `${location.origin}${demo ? "/demo" : ""}/boards/${menuBoard.id}`;
                void navigator.clipboard?.writeText(link).then(() => setNotice("Link copied."));
              },
            },
            { label: "", separator: true, run: () => {} },
            { label: "Move to trash…", danger: true, run: () => setDeleting(menuBoard) },
          ]}
        />
      )}
      {selecting && (
        <div className="board-select-bar" role="toolbar" aria-label="Organize boards">
          <strong>{picked.length} selected</strong>
          <Button disabled={!picked.length} onClick={() => setOrganize({ ids: picked, copy: false })}>
            <FolderInput size={15} />
            Move to…
          </Button>
          <Button disabled={!picked.length} onClick={() => setOrganize({ ids: picked, copy: true })}>
            <Copy size={15} />
            Copy to…
          </Button>
          <Button
            disabled={!picked.length}
            onClick={() => {
              const everyone = picked.every((id) => favorites.includes(id));
              remember({ favorites: everyone ? favorites.filter((id) => !picked.includes(id)) : [...new Set([...favorites, ...picked])] });
            }}
          >
            <Star size={15} />
            Favorite
          </Button>
          <Button
            variant="danger"
            disabled={!picked.length}
            onClick={() => {
              const items = boards.filter((b) => picked.includes(b.id));
              void (async () => {
                for (const item of items) await removeBoard(item);
                setPicked([]);
                setSelecting(false);
              })();
            }}
          >
            <Trash2 size={15} />
            Trash
          </Button>
          <button className="icon-btn" aria-label="Done selecting" title="Done" onClick={() => { setSelecting(false); setPicked([]); }}>
            <Check size={16} />
          </button>
        </div>
      )}
      {folderDialog && (
        <Modal
          title={folderDialog.id ? "Rename folder" : "New folder"}
          description="Folders keep related boards together."
          onClose={() => setFolderDialog(null)}
        >
          <form
            className="board-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveFolder(folderDialog.name, folderDialog.id);
              setFolderDialog(null);
            }}
          >
            <Field label="Folder name">
              <input
                autoFocus
                required
                maxLength={60}
                value={folderDialog.name}
                placeholder="e.g. Client work"
                onChange={(e) => setFolderDialog({ ...folderDialog, name: e.target.value })}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={!folderDialog.name.trim()}>
              {folderDialog.id ? "Save" : "Create folder"}
            </Button>
          </form>
        </Modal>
      )}
      {deletingFolder && (
        <Modal
          title="Delete this folder?"
          description={`“${deletingFolder.name}” will be removed. Its boards are not deleted; they stay in All boards.`}
          onClose={() => setDeletingFolder(null)}
        >
          <div className="board-dialog-actions">
            <Button onClick={() => setDeletingFolder(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { deleteFolder(deletingFolder.id); setDeletingFolder(null); }}>
              Delete folder
            </Button>
          </div>
        </Modal>
      )}
      {organize && (
        <Modal
          title={`${organize.copy ? "Copy" : "Move"} ${organize.ids.length === 1 ? "board" : `${organize.ids.length} boards`} to…`}
          description={organize.copy ? "A copy of each board is placed in the folder you choose." : "Choose a folder for the selected boards."}
          onClose={() => { setOrganize(null); setNewFolderName(""); }}
        >
          <div className="folder-picker">
            {!organize.copy && (
              <button className="folder-pick" onClick={() => { finishOrganize(null); setNewFolderName(""); }}>
                <LayoutGrid size={16} />
                <span>No folder</span>
                <small>All boards only</small>
              </button>
            )}
            {folders.map((item) => (
              <button key={item.id} className="folder-pick" onClick={() => { finishOrganize(item.id); setNewFolderName(""); }}>
                <Folder size={16} />
                <span>{item.name}</span>
                <small>{boards.filter((b) => boardFolders[b.id] === item.id).length} boards</small>
              </button>
            ))}
            <form
              className="folder-new"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newFolderName.trim().slice(0, 60);
                if (!name) return;
                const created = { id: crypto.randomUUID(), name };
                finishOrganize(created.id, [...folders, created]);
                setNewFolderName("");
              }}
            >
              <FolderPlus size={16} />
              <input
                aria-label="New folder name"
                placeholder="New folder…"
                maxLength={60}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <Button type="submit" variant="primary" disabled={!newFolderName.trim()}>
                Create and {organize.copy ? "copy" : "move"}
              </Button>
            </form>
          </div>
        </Modal>
      )}
      {renaming && (
        <Modal title="Rename board" description="Choose a new name." onClose={() => setRenaming(null)}>
          <form
            className="board-form"
            onSubmit={(e) => {
              e.preventDefault();
              const next = renaming.title.trim();
              if (next) void renameBoard(renaming.id, next);
              setRenaming(null);
            }}
          >
            <Field label="Board name">
              <input
                autoFocus
                required
                maxLength={200}
                value={renaming.title}
                onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={!renaming.title.trim()}>
              Save name
            </Button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Move this board to trash?"
          description={`“${deleting.title}” can be restored from Trash for ${TRASH_DAYS} days.`}
          onClose={() => setDeleting(null)}
        >
          <div className="board-dialog-actions">
            <Button onClick={() => setDeleting(null)}>Keep board</Button>
            <Button variant="danger" onClick={() => void removeBoard(deleting)}>
              Move to trash
            </Button>
          </div>
        </Modal>
      )}
      {purging && (
        <Modal
          title="Delete forever?"
          description={`“${purging.title}” will be permanently removed. This cannot be undone.`}
          onClose={() => setPurging(null)}
        >
          <div className="board-dialog-actions">
            <Button onClick={() => setPurging(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void purgeBoard(purging)}>
              Delete forever
            </Button>
          </div>
        </Modal>
      )}
      {emptying && (
        <Modal
          title="Empty trash?"
          description={`${trashed.length} deleted ${trashed.length === 1 ? "board" : "boards"} will be permanently removed. This cannot be undone.`}
          onClose={() => setEmptying(false)}
        >
          <div className="board-dialog-actions">
            <Button onClick={() => setEmptying(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void emptyTrash()}>
              Empty trash
            </Button>
          </div>
        </Modal>
      )}
      {exporting && (
        <ExportDialog
          board={exporting}
          assetUrl={boardAssetUrl}
          onClose={() => setExporting(null)}
        />
      )}
    </section>
    </div>
  );
}

const THUMB_HEIGHTS: Partial<Record<BoardCard["kind"], number>> = {
  note: 110, link: 190, image: 170, scene: 170, checklist: 140, group: 34,
  column: 300, board: 110, color: 130, file: 120, video: 170,
};
function BoardThumbnail({ cards }: { cards?: BoardPreviewCard[] }) {
  if (!cards?.length)
    return (
      <div className="board-preview-art board-preview-blank">
        <PanelsTopLeft size={26} />
        <span>Empty board</span>
      </div>
    );
  const boxes = [...cards]
    .sort((a, b) => Number(b.kind === "column") - Number(a.kind === "column"))
    .map((card) => ({ ...card, h: card.height ?? THUMB_HEIGHTS[card.kind] ?? 120 }));
  const minX = Math.min(...boxes.map((c) => c.x));
  const minY = Math.min(...boxes.map((c) => c.y));
  const maxX = Math.max(...boxes.map((c) => c.x + c.width));
  const maxY = Math.max(...boxes.map((c) => c.y + c.h));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08 + 20;
  return (
    <div className="board-preview-art" aria-hidden="true">
      <svg
        viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {boxes.map((card, index) => (
          <rect
            key={index}
            className={`board-thumb-${card.kind}`}
            x={card.x}
            y={card.kind === "group" ? card.y + 8 : card.y}
            width={card.kind === "group" ? Math.min(card.width, 260) : card.width}
            height={card.kind === "group" ? 22 : card.h}
            rx={card.kind === "group" ? 6 : 10}
            style={
              card.kind === "color"
                ? { fill: card.color_value }
                : card.background_color && card.kind !== "group"
                  ? { fill: card.background_color }
                  : undefined
            }
          />
        ))}
      </svg>
    </div>
  );
}

function BoardEditor({
  initial,
  onReload,
}: {
  initial: Board;
  onReload: () => Promise<void>;
}) {
  const { demo, go, user } = useApp();
  const [board, setBoard] = useState(initial);
  const [view] = useState<"canvas" | "storyboard">("canvas");
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BoardCard | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const requestedPreviews = useRef(new Set<string>());
  const previewsInFlight = useRef(0);
  const [previewVersion, setPreviewVersion] = useState(0);
  const toolDragEnded = useRef(0);
  const [menu, setMenu] = useState<{
    id: string | null;
    x: number;
    y: number;
    point: { x: number; y: number };
    page?: "strip" | "card-background" | "board-background" | "add" | "move";
  } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [emptyCards, setEmptyCards] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [ghost, setGhost] = useState<{ kind: BoardCard["kind"]; x: number; y: number; files: number } | null>(null);
  const draggedTool = useRef<BoardCard["kind"] | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [notice, setNotice] = useState("");
  const toast = useToast();
  useEffect(() => {
    if (!notice) return;
    toast(notice);
    setNotice("");
  }, [notice, toast]);
  const [boardChoices, setBoardChoices] = useState<Summary[]>([]);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [snapTarget, setSnapTarget] = useState<{ cardId: string; point: Point } | null>(null);
  const [viewportScroll, setViewportScroll] = useState({ left: 0, top: 0 });
  // Grid, rulers and snapping are personal to this device, not part of the board.
  const [canvasPrefs, setCanvasPrefs] = useState<CanvasPrefs>(DEFAULT_CANVAS_PREFS);
  const canvasPrefsRef = useRef<CanvasPrefs>(DEFAULT_CANVAS_PREFS);
  const [canvasPanel, setCanvasPanel] = useState(false);
  useEffect(() => {
    const saved = readCanvasPrefs();
    canvasPrefsRef.current = saved;
    setCanvasPrefs(saved);
  }, []);
  function updateCanvasPrefs(next: CanvasPrefs) {
    canvasPrefsRef.current = next;
    setCanvasPrefs(next);
    saveCanvasPrefs(next);
  }
  const [dropTarget, setDropTarget] = useState<{ column: string; x: number; y: number; width: number } | null>(null);
  const [trashHover, setTrashHover] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [ready, setReady] = useState(false);
  const trashZone = useRef<HTMLDivElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadPoint = useRef<Point | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const zoomScroll = useRef<{ left: number; top: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const menuReturnFocus = useRef<HTMLElement | null>(null);
  const clipboard = useRef<BoardCard[] | null>(null);
  const dropDepth = useRef(0);
  const uploadReservations = useRef(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [boardMenu, setBoardMenu] = useState<{ x: number; y: number; page?: "background" } | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 20000);
    return () => clearInterval(timer);
  }, [savedAt]);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const current = useRef(initial);
  const dirty = useRef(false);
  const blocked = useRef(false);
  const saving = useRef<Promise<boolean> | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undo = useRef<Board[]>([]);
  const redo = useRef<Board[]>([]);
  const mounted = useRef(true);
  const draftKey = `mypisara.board-draft.${demo ? "demo" : user?.id}.${initial.id}`;
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const choices: Summary[] = demo
          ? demoBoards().map(summarize)
          : await api("/api/boards");
        if (active) setBoardChoices(choices.filter((item) => item.id !== initial.id));
      } catch {
        if (active) setBoardChoices([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [demo, initial.id]);
  const drag = useRef<{
    id: string;
    pointerId: number;
    moved: boolean;
    px: number;
    py: number;
    lastX: number;
    lastY: number;
    x: number;
    y: number;
    width: number;
    height: number;
    resize: boolean;
    media: { ratio: number; chrome: number; invert?: boolean } | null;
    positions: {
      id: string;
      x: number;
      y: number;
      startX: number | null;
      startY: number | null;
      endX: number | null;
      endY: number | null;
    }[];
  } | null>(null);
  // A press on a video poster can become a drag; if it didn't move, it was a click to play.
  const posterPress = useRef<{ el: HTMLElement; x: number; y: number } | null>(null);
  const lineDrag = useRef<{
    id: string;
    mode: LineEnd | "bend";
    fixed: Point;
    start: Point;
    end: Point;
    // Where the pointer grabbed relative to the curve's midpoint, so a label drag doesn't jump.
    grab: Point;
  } | null>(null);
  const spacePressed = useRef(false);
  const pan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const marqueeDrag = useRef<{
    pointerId: number;
    start: Point;
    additive: boolean;
    base: Set<string>;
  } | null>(null);
  const groupResize = useRef<{
    pointerId: number;
    x: number;
    y: number;
    bounds: { x: number; y: number; width: number; height: number };
    cards: BoardCard[];
  } | null>(null);
  const zoomAt = useCallback(
    (value: number, clientX?: number, clientY?: number) => {
      const el = viewport.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x =
        clientX === undefined ? el.clientWidth / 2 : clientX - rect.left;
      const y =
        clientY === undefined ? el.clientHeight / 2 : clientY - rect.top;
      const next = clampBoardZoom(value);
      zoomScroll.current = {
        left: zoomBoardOffset(el.scrollLeft, x, zoomRef.current, next),
        top: zoomBoardOffset(el.scrollTop, y, zoomRef.current, next),
      };
      zoomRef.current = next;
      setZoom(next);
    },
    [],
  );
  useLayoutEffect(() => {
    if (viewport.current && zoomScroll.current) {
      viewport.current.scrollLeft = zoomScroll.current.left;
      viewport.current.scrollTop = zoomScroll.current.top;
      zoomScroll.current = null;
    }
  }, [zoom]);
  useEffect(() => {
    const el = viewport.current;
    if (!el || view !== "canvas") return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      e.preventDefault();
      zoomAt(
        zoomRef.current * Math.exp(-e.deltaY * 0.003),
        e.clientX,
        e.clientY,
      );
    };
    const touch = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        pinch.current = null;
        return;
      }
      e.preventDefault();
      const [a, b] = Array.from(e.touches);
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!pinch.current) pinch.current = { distance, zoom: zoomRef.current };
      else
        zoomAt(
          (pinch.current.zoom * distance) / Math.max(1, pinch.current.distance),
          (a.clientX + b.clientX) / 2,
          (a.clientY + b.clientY) / 2,
        );
    };
    const end = () => {
      pinch.current = null;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", touch, { passive: false });
    el.addEventListener("touchmove", touch, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touch);
      el.removeEventListener("touchmove", touch);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [view, zoomAt]);
  useEffect(() => {
    if (view !== "canvas") return;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      !!target.closest("input,textarea,select,[contenteditable=true]");
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target)) return;
      e.preventDefault();
      spacePressed.current = true;
      setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spacePressed.current = false;
      setSpaceDown(false);
      if (!pan.current) setPanning(false);
    };
    const reset = () => {
      spacePressed.current = false;
      pan.current = null;
      setSpaceDown(false);
      setPanning(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, [view]);
  useEffect(() => {
    if (view !== "canvas") return;
    const keydown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      const command = e.metaKey || e.ctrlKey;
      if (e.repeat && command) return;
      const active = current.current.cards.find((card) => selection.has(card.id));
      if (command && e.key === "Enter" && active) {
        e.preventDefault();
        add(active.kind, { x: Math.min(10000, active.x + active.width + 24), y: active.y });
        return;
      }
      if (command && e.shiftKey && active?.kind === "group" && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        updateCard(fitHeading(active, { ...active, heading_size: e.key === "1" ? "large" : e.key === "2" ? "normal" : "small" }));
        return;
      }
      if (!command && e.key === "Enter" && active) {
        e.preventDefault(); beginEditing(active); return;
      }
      if (command && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
        return;
      }
      if (command && e.key.toLowerCase() === "z") {
        e.preventDefault();
        history(!e.shiftKey);
        return;
      }
      if (command && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history(false);
        return;
      }
      if (command && e.key.toLowerCase() === "d" && selection.size) {
        e.preventDefault();
        placeMany(selectionWith());
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selection.size) {
        e.preventDefault();
        trashMany([...selection]);
        return;
      }
      if (e.key === "Escape" && !command) {
        if (selection.size) {
          e.preventDefault();
          setSelection(new Set());
          setSelected(null);
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if ((command && e.key.toLowerCase() === "f") || (!command && !e.altKey && e.key === "/")) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (!command && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFocusMode((on) => !on);
        return;
      }
      const quick = Object.fromEntries(
        Object.entries(TOOL_KEYS).map(([kind, key]) => [key!.toLowerCase(), kind as BoardCard["kind"]]),
      );
      if (!command && !e.altKey && !e.shiftKey && quick[e.key]) {
        e.preventDefault();
        add(quick[e.key]);
        return;
      }
      const offsets: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const offset = offsets[e.key];
      if (offset && selection.size) {
        e.preventDefault();
        const amount = e.shiftKey ? 10 : 1;
        change({
          ...current.current,
          cards: current.current.cards.map((card) => {
            if (!selection.has(card.id) || card.locked) return card;
            const dx = offset.x * amount;
            const dy = offset.y * amount;
            return {
              ...card,
              x: Math.max(0, Math.min(10000, card.x + dx)),
              y: Math.max(0, Math.min(10000, card.y + dy)),
              ...(card.kind === "line"
                ? {
                    line_start_x: card.line_start_x === null ? null : Math.max(0, Math.min(10000, card.line_start_x + dx)),
                    line_start_y: card.line_start_y === null ? null : Math.max(0, Math.min(10000, card.line_start_y + dy)),
                    line_end_x: card.line_end_x === null ? null : Math.max(0, Math.min(10000, card.line_end_x + dx)),
                    line_end_y: card.line_end_y === null ? null : Math.max(0, Math.min(10000, card.line_end_y + dy)),
                  }
                : {}),
            };
          }),
        });
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [view, selection, historyVersion, zoom]);
  function fitBoard() {
    const el = viewport.current;
    if (!el || !current.current.cards.length) {
      zoomAt(1);
      return;
    }
    const collapsed = new Set(current.current.cards.filter((card) => card.kind === "column" && card.collapsed).map((card) => card.id));
    const cards = current.current.cards.filter((card) => !card.parent_id || !collapsed.has(card.parent_id));
    const minX = Math.min(...cards.map((c) => c.x));
    const minY = Math.min(...cards.map((c) => c.y));
    const maxX = Math.max(...cards.map((c) => c.x + c.width));
    const maxY = Math.max(...cards.map((card) => card.y + cardHeight(card, el)));
    const next = clampBoardZoom(
      Math.min(
        (el.clientWidth - 60) / Math.max(1, maxX - minX),
        (el.clientHeight - 60) / Math.max(1, maxY - minY),
      ),
    );
    zoomScroll.current = {
      left: Math.max(0, minX * next - 30),
      top: Math.max(0, minY * next - 30),
    };
    zoomRef.current = next;
    setZoom(next);
    if (next === zoom) {
      el.scrollLeft = zoomScroll.current.left;
      el.scrollTop = zoomScroll.current.top;
      zoomScroll.current = null;
    }
  }
  const commit = useCallback(async (): Promise<boolean> => {
    if (saving.current) {
      const success = await saving.current;
      if (!success) return false;
      if (dirty.current && !blocked.current) return commit();
      return !dirty.current;
    }
    if (!dirty.current) return true;
    if (blocked.current) return false;
    const snapshot = current.current;
    const version = generation.current;
    setStatus("Saving…");
    const task = (async () => {
      await Promise.resolve();
      try {
        let saved: { revision: number; updated_at: string };
        if (demo) {
          const all = demoBoards();
          const stored = all.find((b) => b.id === snapshot.id);
          if (!stored || stored.revision !== snapshot.revision)
            throw new Error(
              "This board changed in another tab. Download your draft before loading the latest version.",
            );
          saved = {
            revision: snapshot.revision + 1,
            updated_at: new Date().toISOString(),
          };
          const next = { ...snapshot, ...saved };
          // The demo uses a small image limit because browser storage is finite.
          localStorage.setItem(
            BOARD_STORAGE,
            JSON.stringify(all.map((b) => (b.id === next.id ? next : b))),
          );
        } else
          saved = await api("/api/boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snapshot),
          });
        current.current = { ...current.current, ...saved };
        dirty.current = generation.current !== version;
        if (!dirty.current) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify(current.current));
        if (mounted.current) {
          setBoard(current.current);
          setStatus(dirty.current ? "Unsaved changes" : "Saved");
          if (!dirty.current) setSavedAt(Date.now());
          setError("");
        }
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unable to save.";
        blocked.current = message.includes("another tab");
        if (mounted.current) {
          setError(message);
          setStatus("Not saved");
        }
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = task;
    return task;
  }, [demo, draftKey]);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void commit().then(() => {
        if (dirty.current && !blocked.current) setStatus("Not saved — retry");
      });
    }, 700);
  }, [commit]);
  function change(next: Board, remember = true) {
    if (remember) {
      undo.current = [...undo.current.slice(-39), current.current];
      redo.current = [];
    }
    current.current = next;
    generation.current++;
    dirty.current = true;
    setBoard(next);
    setStatus("Unsaved changes");
    setHistoryVersion((v) => v + 1);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      setError(
        "Browser draft storage is full. Keep this page open until the board is saved.",
      );
    }
    schedule();
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = boardSchema.safeParse(JSON.parse(raw));
        if (parsed.success && parsed.data.id === initial.id) {
          current.current = parsed.data;
          setBoard(parsed.data);
          dirty.current = true;
          generation.current++;
          if (parsed.data.revision === initial.revision) {
            setStatus("Recovered draft");
            schedule();
          } else {
            blocked.current = true;
            setStatus("Not saved");
            setError(
              "Recovered draft conflicts with the saved board. Download your draft before loading the latest version.",
            );
          }
        }
      }
    } catch {
      setError("Could not restore the browser draft.");
    }
    setReady(true);
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty.current || uploadReservations.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") void commit();
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      void commit();
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [commit, draftKey, initial, schedule]);
  function history(back: boolean) {
    const from = back ? undo : redo,
      to = back ? redo : undo;
    setEditing(null);
    const prev = from.current.pop();
    if (!prev) return;
    to.current.push(current.current);
    change(
      {
        ...prev,
        revision: current.current.revision,
        updated_at: current.current.updated_at,
      },
      false,
    );
  }
  function updateCard(card: BoardCard, remember = true) {
    change(
      {
        ...current.current,
        cards: current.current.cards.map((c) => (c.id === card.id ? card : c)),
      },
      remember,
    );
  }
  function beginEditing(card: BoardCard) {
    if (editing?.id === card.id) return;
    undo.current = [...undo.current.slice(-39), current.current];
    redo.current = [];
    setEditing(card);
    setSelected(card.id);
    setSelection(new Set([card.id]));
  }
  function closeEditing(id: string) {
    setEditing(null);
    const closed = current.current.cards.find((card) => card.id === id);
    if (closed?.kind === "board" && closed.target_board_id && closed.title.trim())
      void renameLinkedBoard(closed.target_board_id, closed.title.trim());
    requestAnimationFrame(() => {
      viewport.current?.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function creator() {
    return {
      created_by_id: user?.id ?? "",
      created_by_name: user?.name || (demo ? "Demo" : ""),
    };
  }
  function positionedCard(kind: BoardCard["kind"], point: Point) {
    const card = { ...newCard(kind), ...creator(), ...point, ...(kind === "shape" ? { shape_seed: 1 + Math.floor(Math.random() * 99000) } : {}) };
    return kind === "line"
      ? {
          ...card,
          line_start_x: point.x,
          line_start_y: point.y,
          line_end_x: Math.min(10000, point.x + card.width),
          line_end_y: Math.min(10000, point.y + (card.height ?? 120)),
        }
      : card;
  }
  function add(kind: BoardCard["kind"], point = visiblePoint()) {
    if (kind === "board") {
      void addLinkedBoard(point);
      return;
    }
    const card = positionedCard(kind, point);
    if (place(card) && kind !== "line") setEditing(card);
  }
  // The Board tool creates a new board inside this one.
  async function addLinkedBoard(point: Point) {
    if (current.current.cards.length + current.current.trash.length + uploadReservations.current >= 300) {
      setError("This board is full. Remove cards from trash to make room.");
      return;
    }
    try {
      const child = boardSchema.parse(newBoard("Untitled board"));
      if (demo) {
        child.revision = 1;
        localStorage.setItem(BOARD_STORAGE, JSON.stringify([child, ...demoBoards()]));
      } else
        Object.assign(child, await api("/api/boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(child),
        }));
      if (!mounted.current) return;
      setBoardChoices((list) => [summarize(child), ...list]);
      const card = { ...positionedCard("board", point), title: child.title, target_board_id: child.id };
      if (place(card)) setEditing(card);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the board.");
    }
  }
  async function renameLinkedBoard(id: string, title: string) {
    const known = boardChoices.find((item) => item.id === id);
    if (!known || known.title === title) return;
    try {
      if (demo) {
        const all = demoBoards();
        if (!all.some((item) => item.id === id)) return;
        localStorage.setItem(BOARD_STORAGE, JSON.stringify(all.map((item) =>
          item.id === id ? { ...item, title, revision: item.revision + 1, updated_at: new Date().toISOString() } : item)));
      } else {
        const target = boardSchema.parse(await api(`/api/boards?id=${encodeURIComponent(id)}`));
        await api("/api/boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...target, title }),
        });
      }
      if (mounted.current) setBoardChoices((list) => list.map((item) => item.id === id ? { ...item, title } : item));
    } catch {
      /* The card keeps its own title when the linked board cannot be renamed. */
    }
  }
  async function openBoard(id: string) {
    if (!(await commit())) return;
    writeTrail([...trail, { id: current.current.id, title: current.current.title }]);
    go(`/boards/${id}`);
  }
  async function openCrumb(index: number) {
    if (!(await commit())) return;
    writeTrail(trail.slice(0, index));
    go(`/boards/${trail[index].id}`);
  }
  useEffect(() => {
    const saved = readTrail();
    const index = saved.findIndex((crumb) => crumb.id === initial.id);
    const next = index >= 0 ? saved.slice(0, index) : saved;
    setTrail(next);
    writeTrail(next);
  }, [initial.id]);
  const heightOf = (card: BoardCard) => cardHeight(card, viewport.current);
  // Keep column contents stacked after every render, using measured heights.
  const [layoutTick, setLayoutTick] = useState(0);
  useLayoutEffect(() => {
    // Moving cards must not fight the drop indicator, but resizing a column should reflow its cards live.
    if (!ready || (drag.current && !drag.current.resize) || lineDrag.current || groupResize.current) return;
    const cards = stackColumns(current.current.cards, (card) => cardHeight(card, viewport.current));
    if (cards !== current.current.cards) change({ ...current.current, cards }, false);
  });
  // A card inside a column can change height by itself (an image finishing loading, text re-wrapping,
  // a to-do growing). Watch them so the stack re-spaces instead of letting cards overlap.
  const stackedKey = board?.cards.filter((card) => card.parent_id || card.kind === "column").map((card) => card.id).join(",") ?? "";
  useEffect(() => {
    const root = viewport.current;
    if (!root || typeof ResizeObserver === "undefined" || !stackedKey) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setLayoutTick((tick) => tick + 1));
    });
    root.querySelectorAll("[data-in-column]").forEach((element) => observer.observe(element));
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [stackedKey, view]);
  void layoutTick;
  function columnAt(point: Point, exclude: Set<string>) {
    return [...current.current.cards].reverse().find((card) =>
      card.kind === "column" && !exclude.has(card.id) &&
      point.x >= card.x && point.x <= card.x + card.width &&
      point.y >= card.y && point.y <= card.y + heightOf(card));
  }
  function overTrash(x: number, y: number) {
    const rect = trashZone.current?.getBoundingClientRect();
    return !!rect && rect.width > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
  function selectionWith(seed?: BoardCard) {
    const chosen = seed && !selection.has(seed.id)
      ? [seed]
      : current.current.cards.filter((card) => selection.has(card.id));
    const ids = new Set(chosen.map((card) => card.id));
    return current.current.cards.filter((card) => ids.has(card.id) || (!!card.parent_id && ids.has(card.parent_id)));
  }
  // Scrolls the canvas so a card sits in the middle of the view.
  function revealCard(card: BoardCard) {
    const el = viewport.current;
    if (!el) return;
    const anchor = card.parent_id ? current.current.cards.find((c) => c.id === card.parent_id) ?? card : card;
    const height = cardHeight(anchor, el);
    el.scrollTo({
      left: Math.max(0, (anchor.x + anchor.width / 2) * zoom - el.clientWidth / 2),
      top: Math.max(0, (anchor.y + height / 2) * zoom - el.clientHeight / 2),
      behavior: "smooth",
    });
  }
  function stepMatch(direction: 1 | -1) {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    revealCard(matches[next]);
    selectCard(matches[next].id);
  }
  // Copies cards to another board (placed below its content) and removes them
  // here; they stay recoverable from this board's trash.
  async function moveToBoard(ids: string[], targetId: string, targetTitle: string) {
    const moving = current.current.cards.filter(
      (card) => ids.includes(card.id) || (card.parent_id && ids.includes(card.parent_id)),
    );
    if (!moving.length) return;
    try {
      const target = boardSchema.parse(
        demo ? demoBoards().find((item) => item.id === targetId) : await api(`/api/boards?id=${encodeURIComponent(targetId)}`),
      );
      if (target.cards.length + target.trash.length + moving.length > 300)
        throw new Error(`“${targetTitle}” doesn't have room for ${moving.length} more cards.`);
      const idMap = new Map(moving.map((card) => [card.id, crypto.randomUUID()]));
      const top = moving.filter((card) => !card.parent_id);
      const minX = Math.min(...top.map((card) => card.x));
      const minY = Math.min(...top.map((card) => card.y));
      const floor = Math.max(0, ...target.cards.filter((card) => !card.parent_id).map((card) => card.y + (card.height ?? 180)));
      const dx = 40 - minX;
      const dy = floor + 60 - minY;
      const clamp = (value: number) => Math.max(0, Math.min(10000, value));
      const remap = (c: BoardCard["line_start_connection"]) =>
        c && idMap.has(c.card_id) ? { ...c, card_id: idMap.get(c.card_id)! } : null;
      const placed = moving.map((card) => ({
        ...card,
        id: idMap.get(card.id)!,
        parent_id: card.parent_id ? idMap.get(card.parent_id) ?? null : null,
        x: card.parent_id ? card.x : clamp(card.x + dx),
        y: card.parent_id ? card.y : clamp(card.y + dy),
        target_board_id: card.target_board_id === targetId ? null : card.target_board_id,
        ...(card.kind === "line"
          ? {
              line_start_x: card.line_start_x === null ? null : clamp(card.line_start_x + dx),
              line_start_y: card.line_start_y === null ? null : clamp(card.line_start_y + dy),
              line_end_x: card.line_end_x === null ? null : clamp(card.line_end_x + dx),
              line_end_y: card.line_end_y === null ? null : clamp(card.line_end_y + dy),
              line_start_connection: remap(card.line_start_connection),
              line_end_connection: remap(card.line_end_connection),
            }
          : {}),
      }));
      const updated = boardSchema.parse({ ...target, cards: [...target.cards, ...placed] });
      if (demo) {
        localStorage.setItem(
          BOARD_STORAGE,
          JSON.stringify(demoBoards().map((item) =>
            item.id === targetId
              ? { ...updated, revision: item.revision + 1, updated_at: new Date().toISOString() }
              : item)),
        );
      } else {
        await api("/api/boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
      }
      let next = current.current;
      for (const card of moving) next = trashCard(next, card.id);
      change(next);
      setSelected(null);
      setSelection(new Set());
      toast(
        `Moved ${moving.length === 1 ? "1 card" : `${moving.length} cards`} to “${targetTitle}”`,
        { action: { label: "Open board", run: () => void openBoard(targetId) } },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move the cards.");
    }
  }
  function trashMany(ids: string[]) {
    if (!ids.length) return;
    let next = current.current;
    for (const id of ids) next = trashCard(next, id);
    change(next);
    setSelected(null);
    setSelection(new Set());
    setEditing(null);
    toast(ids.length === 1 ? "Moved to trash" : `${ids.length} cards moved to trash`, {
      action: { label: "Undo", run: () => history(true) },
    });
  }
  function placeMany(cards: BoardCard[], point?: Point) {
    if (!cards.length) return false;
    if (current.current.cards.length + current.current.trash.length + uploadReservations.current + cards.length > 300) {
      setError("This board is full. Remove cards from trash to make room.");
      return false;
    }
    const left = Math.min(...cards.map((card) => card.x));
    const top = Math.min(...cards.map((card) => card.y));
    const columns = new Set(current.current.cards.filter((card) => card.kind === "column").map((card) => card.id));
    const copies = cloneCards(cards, point ? point.x - left : 30, point ? point.y - top : 30)
      .map((copy, index) => ({
        ...copy,
        ...creator(),
        // A duplicate made in place stays in its original column.
        parent_id: copy.parent_id ?? (!point && cards[index].parent_id && columns.has(cards[index].parent_id!) ? cards[index].parent_id : null),
      }));
    change({
      ...current.current,
      cards: [...current.current.cards, ...copies],
      scene_order: [
        ...current.current.scene_order,
        ...copies.filter((card) => card.kind === "scene").map((card) => card.id),
      ],
    });
    setSelection(new Set(copies.map((card) => card.id)));
    setSelected(copies.at(-1)?.id || null);
    return true;
  }
  function align(mode: BoardAlignment) {
    const movable = new Set([...selection].filter((id) => !current.current.cards.find((c) => c.id === id)?.locked));
    const cards = alignCards(current.current.cards, movable, mode, heightOf);
    if (cards !== current.current.cards) change({ ...current.current, cards });
  }
  // Typing in the side panel undoes as one step.
  function rememberEdit() {
    undo.current = [...undo.current.slice(-39), current.current];
    redo.current = [];
    setHistoryVersion((v) => v + 1);
  }
  function inlineChange(id: string, patch: Partial<BoardCard>) {
    const card = current.current.cards.find((c) => c.id === id);
    if (card) updateCard(fitHeading(card, { ...card, ...patch }), false);
  }
  const previewCandidates = board.cards.filter((card) => LINK_PREVIEW_KINDS.includes(card.kind) && card.url && card.link_preview?.url !== card.url)
    .map((card) => `${card.id}|${card.url}`).join("\n");
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const card of current.current.cards) {
        if (previewsInFlight.current >= 3) break;
        if (!LINK_PREVIEW_KINDS.includes(card.kind) || !card.url || card.link_preview?.url === card.url) continue;
        const key = `${card.id}|${card.url}`;
        if (requestedPreviews.current.has(key)) continue;
        requestedPreviews.current.add(key);
        previewsInFlight.current++;
        const url = card.url;
        void fetch("/api/boards/link-preview", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
        }).then(async (response) => {
          if (!response.ok) return;
          const preview = await response.json();
          const latest = current.current.cards.find((item) => item.id === card.id);
          if (!mounted.current || !latest || latest.url !== url) return;
          inlineChange(card.id, { link_preview: preview,
            // Video and audio cards only borrow the page title; their notes stay empty.
            ...(latest.kind === "link" && !latest.body ? { body: preview.description } : {}),
            ...(!latest.title || (latest.kind === "link" && latest.title === "Reference link") ? { title: preview.title } : {}) });
        }).catch(() => { /* Keep the saved URL when a site cannot be previewed. */ })
          .finally(() => { previewsInFlight.current--; if (mounted.current) setPreviewVersion((version) => version + 1); });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [previewCandidates, previewVersion]);
  function selectCard(id: string, additive = false) {
    setSelected(id);
    setSelection((previous) => {
      if (!additive) return previous.has(id) ? previous : new Set([id]);
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelection(new Set(current.current.cards.map((c) => c.id)));
    setSelected(current.current.cards[0]?.id || null);
    setNotice(`${current.current.cards.length} cards selected`);
  }
  function place(card: BoardCard, reserved = false) {
    if (
      current.current.cards.length +
        current.current.trash.length +
        uploadReservations.current -
        (reserved ? 1 : 0) >=
      300
    ) {
      setError("This board is full. Remove cards from trash to make room.");
      return false;
    }
    change({
      ...current.current,
      cards: [...current.current.cards, card],
      scene_order:
        card.kind === "scene"
          ? [...current.current.scene_order, card.id]
          : current.current.scene_order,
    });
    setSelected(card.id);
    setSelection(new Set([card.id]));
    return true;
  }
  function duplicate(card: BoardCard) {
    placeMany(selectionWith(card));
  }
  const closeMenu = useCallback(() => {
    setMenu(null);
    if (menuReturnFocus.current?.isConnected) menuReturnFocus.current.focus();
    else viewport.current?.focus();
  }, []);
  function openMenu(
    id: string | null,
    x: number,
    y: number,
    target: HTMLElement,
  ) {
    if (id) selectCard(id);
    menuReturnFocus.current = target;
    setMenu({
      id,
      point: canvasPoint(x, y),
      x: Math.min(x, window.innerWidth - 230),
      y: Math.min(y, window.innerHeight - 420),
    });
  }
  function payload(cards: BoardCard[]) {
    return JSON.stringify({ type: CLIPBOARD_TAG, cards });
  }
  async function copyCards(cards: BoardCard[], cut = false) {
    if (!cards.length) return;
    clipboard.current = cards;
    try {
      await navigator.clipboard.writeText(payload(cards));
    } catch {
      /* The in-board clipboard remains available. */
    }
    const noun = cards.length === 1 ? "Card" : `${cards.length} cards`;
    if (cut) trashMany(cards.map((card) => card.id));
    setNotice(`${noun} ${cut ? "cut" : "copied"}. Paste onto the canvas.`);
  }
  function canvasPoint(clientX: number, clientY: number) {
    const el = viewport.current;
    if (!el) return { x: 40, y: 40 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(
        10000,
        Math.max(0, Math.round((clientX - rect.left + el.scrollLeft) / zoom)),
      ),
      y: Math.min(
        10000,
        Math.max(0, Math.round((clientY - rect.top + el.scrollTop) / zoom)),
      ),
    };
  }
  // The first open spot in view, so new cards don't land on top of others.
  function visiblePoint(width = 270, height = 160) {
    const el = viewport.current;
    const left = (el?.scrollLeft || 0) / zoom;
    const top = (el?.scrollTop || 0) / zoom;
    const right = left + (el?.clientWidth || 1200) / zoom;
    const bottom = top + (el?.clientHeight || 700) / zoom;
    const start = {
      x: Math.round((left + 40) / 20) * 20,
      y: Math.round((top + 40) / 20) * 20,
    };
    const boxes = current.current.cards
      .filter((card) => card.kind !== "line" && !card.parent_id)
      .map((card) => ({
        x: card.x - 16,
        y: card.y - 16,
        right: card.x + card.width + 16,
        bottom: card.y + cardHeight(card, el) + 16,
      }));
    for (let y = start.y; y + height <= Math.max(bottom, start.y + height); y += 40)
      for (let x = start.x; x + width <= Math.max(right, start.x + width); x += 40)
        if (!boxes.some((box) => x < box.right && x + width > box.x && y < box.bottom && y + height > box.y))
          return { x, y };
    return start;
  }
  function pasteText(text: string, point = visiblePoint()) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.type === CLIPBOARD_TAG) {
        const cards = (Array.isArray(parsed.cards) ? parsed.cards : [parsed.card])
          .map((card: unknown) => boardCardSchema.parse(card));
        if (cards.some((card: BoardCard) => !validBoardImage(card.image, demo ? undefined : user?.id)))
          throw new Error("This image belongs to a different workspace.");
        placeMany(cards, point);
        return true;
      }
    } catch {
      /* Plain text may be a reference URL. */
    }
    if (/^https?:\/\/\S+$/i.test(text.trim()) && text.trim().length <= 2048) {
      // Pasted YouTube, Spotify and similar links become playable cards.
      const media = parseEmbed(text.trim(), location.hostname);
      place({
        ...newCard(media?.provider === "Direct file" || !media ? "link" : media.media === "audio" ? "audio_link" : "video_link"),
        ...creator(),
        ...point,
        url: text.trim(),
        title: media ? "" : "Reference link",
      });
      return true;
    }
    if (text.trim()) {
      return place({ ...newCard("note"), ...creator(), ...point, body: text.slice(0, 20000) });
    }
    return false;
  }
  async function pasteClipboard(point = visiblePoint()) {
    try {
      if (pasteText(await navigator.clipboard.readText(), point)) return;
    } catch {
      /* Clipboard access may require browser permission. */
    }
    if (clipboard.current) placeMany(clipboard.current, point);
    else setNotice("Use Ctrl+V or ⌘V to paste a copied card or image.");
  }
  function patchPending(id: string, patch: Partial<PendingUpload>) {
    if (mounted.current) setPending((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  function dropPending(id: string) {
    setPending((items) => {
      const found = items.find((item) => item.id === id);
      if (found?.preview) URL.revokeObjectURL(found.preview);
      return items.filter((item) => item.id !== id);
    });
  }
  // One upload from start to placed card. The reservation taken by the caller is released here.
  async function processUpload(item: PendingUpload) {
    try {
      patchPending(item.id, { stage: "preparing", error: "", progress: 0 });
      const prepared = await prepareUpload(item.file, demo);
      const width = prepared.ratio ? Math.round(Math.min(400, Math.max(220, prepared.naturalWidth))) : 300;
      patchPending(item.id, {
        stage: "uploading",
        width,
        height: prepared.ratio ? Math.round(width / prepared.ratio) + 70 : 120,
      });
      let reported = 0;
      const asset = await uploadBoardAsset(prepared.file, demo, (fraction) => {
        // Update at whole-percent steps so a fast upload doesn't re-render the board constantly.
        const next = Math.round(Math.min(1, Math.max(0, fraction)) * 100) / 100;
        if (next !== reported) { reported = next; patchPending(item.id, { progress: next }); }
      });
      const kind: BoardCard["kind"] = prepared.file.type.startsWith("image/")
        ? "image"
        : prepared.file.type.startsWith("video/")
          ? "video"
          : "file";
      if (mounted.current) {
        place(
          {
            ...newCard(kind),
            ...creator(),
            title: item.name.replace(/\.[^.]+$/, "").slice(0, 200) || item.name.slice(0, 200),
            image: asset,
            file_name: prepared.file.name.slice(0, 255),
            file_type: prepared.file.type.slice(0, 120),
            file_size: prepared.file.size,
            ...(prepared.ratio ? { width } : {}),
            x: item.x,
            y: item.y,
          },
          true,
        );
        dropPending(item.id);
      }
    } catch (e) {
      patchPending(item.id, { stage: "error", error: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      uploadReservations.current--;
      if (mounted.current) setUploadCount((n) => n - 1);
    }
  }
  async function uploadFiles(files: File[], point: { x: number; y: number }) {
    const slots =
      300 -
      current.current.cards.length -
      current.current.trash.length -
      uploadReservations.current;
    const batch = files.slice(0, Math.max(0, slots));
    if (batch.length < files.length)
      setUploadError(
        `${files.length - batch.length} file${files.length - batch.length === 1 ? "" : "s"} skipped: this board has a 300-card limit, including trash.`,
      );
    if (!batch.length) return;
    uploadReservations.current += batch.length;
    setUploadCount((n) => n + batch.length);
    // Placeholders appear at once, in a tidy grid, while files are prepared and uploaded.
    const items: PendingUpload[] = batch.map((file, i) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      x: Math.min(10000, point.x + (i % 3) * 440),
      y: Math.min(10000, point.y + Math.floor(i / 3) * 360),
      width: 300,
      height: file.type.startsWith("image/") ? 200 : 120,
      preview: file.type.startsWith("image/") && file.type !== "image/svg+xml" ? URL.createObjectURL(file) : null,
      stage: "preparing",
      error: "",
      progress: 0,
    }));
    setPending((existing) => [...existing, ...items]);
    const queue = [...items];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) await processUpload(item);
    };
    await Promise.all([worker(), worker(), worker()]);
  }
  function retryUpload(item: PendingUpload) {
    if (current.current.cards.length + current.current.trash.length + uploadReservations.current >= 300) {
      setUploadError("This board is full. Remove cards from trash to make room.");
      return;
    }
    uploadReservations.current++;
    setUploadCount((n) => n + 1);
    void processUpload(item);
  }
  function acceptsDrop(e: DragEvent) {
    return (
      view === "canvas" &&
      (e.dataTransfer.types.includes("Files") ||
        e.dataTransfer.types.includes(TOOL_MIME) ||
        e.dataTransfer.types.includes("text/uri-list") ||
        e.dataTransfer.types.includes("text/plain"))
    );
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dropDepth.current = 0;
    setDropActive(false);
    setGhost(null);
    if (drag.current) return;
    if (view !== "canvas") return;
    const point = canvasPoint(e.clientX, e.clientY);
    if (e.dataTransfer.files.length) {
      void uploadFiles(Array.from(e.dataTransfer.files), point);
      return;
    }
    const kind = e.dataTransfer.getData(TOOL_MIME) as BoardCard["kind"];
    if (Object.hasOwn(labels, kind)) add(kind, point);
    else
      pasteText(
        e.dataTransfer.getData("text/plain") ||
          e.dataTransfer.getData("text/uri-list"),
        point,
      );
  }
  function startDrag(
    e: PointerEvent<HTMLElement>,
    card: BoardCard,
    resize = false,
    surface = false,
  ) {
    if (e.button !== 0 || view !== "canvas" || spacePressed.current) return;
    // Locked cards stay put; pressing one just selects it.
    if (card.locked) {
      if (!surface) selectCard(card.id);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!surface) selectCard(card.id);
    const article = e.currentTarget.closest("article");
    // Playback fights with move/resize gestures, so pause while one starts.
    article?.querySelectorAll("video, audio").forEach((item) => (item as HTMLMediaElement).pause());
    drag.current = {
      id: card.id,
      pointerId: e.pointerId,
      moved: false,
      px: e.clientX,
      py: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      x: card.x,
      y: card.y,
      width: card.width,
      height:
        card.height ??
        e.currentTarget.closest("article")!.getBoundingClientRect().height /
          zoom,
      resize,
      media: resize ? (card.kind === "shape" ? { ratio: card.width / (card.height ?? 120), chrome: 0, invert: true } : mediaFrame(article)) : null,
      positions: current.current.cards
        .filter(
          (c) =>
            c.id === card.id ||
            (!c.locked &&
              ((!resize && card.kind === "column" && c.parent_id === card.id) ||
                (!resize && selection.has(card.id) && selection.has(c.id)))),
        )
        .map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          startX: c.line_start_x,
          startY: c.line_start_y,
          endX: c.line_end_x,
          endY: c.line_end_y,
        })),
    };
  }
  function moveDrag(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < 3) return;
      d.moved = true;
      undo.current = [...undo.current.slice(-39), current.current];
      redo.current = [];
    }
    const rawDx = (e.clientX - d.px) / zoom;
    const rawDy = (e.clientY - d.py) / zoom;
    let dx = rawDx;
    let dy = rawDy;
    if (!d.resize) {
      const primary = current.current.cards.find((card) => card.id === d.id);
      const origin = d.positions.find((position) => position.id === d.id);
      if (primary && origin && primary.kind !== "line" && canvasPrefsRef.current.snap) {
        const moving = new Set(d.positions.map((position) => position.id));
        const primaryHeight = cardHeight(primary, viewport.current);
        const xAnchors = [origin.x + rawDx, origin.x + rawDx + primary.width / 2, origin.x + rawDx + primary.width];
        const yAnchors = [origin.y + rawDy, origin.y + rawDy + primaryHeight / 2, origin.y + rawDy + primaryHeight];
        const threshold = 7 / zoom;
        let bestX: { delta: number; guide: number } | undefined;
        let bestY: { delta: number; guide: number } | undefined;
        for (const other of current.current.cards) {
          if (moving.has(other.id) || other.kind === "line") continue;
          const otherHeight = cardHeight(other, viewport.current);
          for (const guide of [other.x, other.x + other.width / 2, other.x + other.width])
            for (const target of xAnchors) {
              const delta = guide - target;
              if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta)))
                bestX = { delta, guide };
            }
          for (const guide of [other.y, other.y + otherHeight / 2, other.y + otherHeight])
            for (const target of yAnchors) {
              const delta = guide - target;
              if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta)))
                bestY = { delta, guide };
            }
        }
        if (bestX) dx += bestX.delta;
        if (bestY) dy += bestY.delta;
        setGuides({ x: bestX?.guide, y: bestY?.guide });
      }
    }
    const cards = current.current.cards.map((c) =>
      (d.resize ? c.id !== d.id : !d.positions.some((p) => p.id === c.id))
        ? c
        : {
            ...c,
            ...(d.resize && d.media && (d.media.invert ? e.shiftKey : !e.shiftKey)
              ? (() => {
                  // Width leads; height follows the media's ratio. Hold Shift to crop freely.
                  let width = Math.min(2000, Math.max(c.kind === "shape" ? 40 : 220, d.width + rawDx));
                  let height = width / d.media.ratio + d.media.chrome;
                  if (height > 2000) {
                    height = 2000;
                    width = Math.max(220, (2000 - d.media.chrome) * d.media.ratio);
                  }
                  return { width, height };
                })()
              : d.resize
              ? {
                  width: Math.min(
                    2000,
                    Math.max(c.kind === "column" ? COLUMN_MIN_WIDTH : c.kind === "color" || c.kind === "group" ? 120 : c.kind === "shape" ? 40 : 220, d.width + rawDx),
                  ),
                  // A heading's height always follows its wrapped text, so resizing only changes its width.
                  height: c.kind === "group" ? null : c.kind === "column" ? c.height : Math.min(
                    2000,
                    Math.max(
                      c.kind === "line" ? 40 : c.kind === "shape" ? 24 : 100,
                      d.height + rawDy,
                    ),
                  ),
                }
              : {
                  ...(c.kind === "line"
                    ? {
                        line_start_x:
                          (d.positions.find((p) => p.id === c.id)!.startX ?? c.x) +
                          dx,
                        line_start_y:
                          (d.positions.find((p) => p.id === c.id)!.startY ?? c.y) +
                          dy,
                        line_end_x:
                          (d.positions.find((p) => p.id === c.id)!.endX ??
                            c.x + c.width) +
                          dx,
                        line_end_y:
                          (d.positions.find((p) => p.id === c.id)!.endY ??
                            c.y + (c.height ?? 120)) +
                          dy,
                      }
                    : {}),
                  x: Math.min(
                    10000,
                    Math.max(
                      0,
                      d.positions.find((p) => p.id === c.id)!.x +
                        dx,
                    ),
                  ),
                  y: Math.min(
                    10000,
                    Math.max(
                      0,
                      d.positions.find((p) => p.id === c.id)!.y +
                        dy,
                    ),
                  ),
                }),
          },
    );
    current.current = { ...current.current, cards };
    setBoard(current.current);
    if (!d.resize) {
      const trashing = overTrash(e.clientX, e.clientY);
      setTrashHover(trashing);
      const moving = new Set(d.positions.map((position) => position.id));
      const joins = d.positions.some((position) => {
        const card = cards.find((item) => item.id === position.id);
        return card && !["line", "column"].includes(card.kind);
      });
      const pointer = canvasPoint(e.clientX, e.clientY);
      const column = !trashing && joins ? columnAt(pointer, moving) : undefined;
      if (column) {
        const insertion = columnInsertion(cards, column, pointer.y, heightOf, moving);
        setDropTarget({ column: column.id, x: column.x + 12, y: insertion.y, width: column.width - 24 });
      } else setDropTarget(null);
    }
  }
  function endDrag() {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    setGuides({});
    setDropTarget(null);
    setTrashHover(false);
    if (!active.moved) return;
    if (!active.resize) {
      const moving = new Set(active.positions.map((position) => position.id));
      if (overTrash(active.lastX, active.lastY)) {
        let next = current.current;
        for (const id of moving) next = trashCard(next, id);
        change(next, false);
        setSelection(new Set());
        setSelected(null);
        setNotice(moving.size === 1
          ? "Moved to trash. You can restore it from Board trash."
          : `${moving.size} cards moved to trash. You can restore them from Board trash.`);
        return;
      }
      const pointer = canvasPoint(active.lastX, active.lastY);
      const column = columnAt(pointer, moving);
      const insertion = column
        ? columnInsertion(current.current.cards, column, pointer.y, heightOf, moving)
        : null;
      const joining = current.current.cards
        .filter((card) => moving.has(card.id) && !["line", "column"].includes(card.kind) &&
          !(card.parent_id && moving.has(card.parent_id)))
        .sort((a, b) => a.y - b.y);
      const patches = new Map(joining.map((card, index) => [
        card.id,
        column && insertion
          ? { parent_id: column.id, y: Math.max(0, insertion.order + index * 0.01) }
          : { parent_id: null },
      ]));
      current.current = {
        ...current.current,
        cards: current.current.cards.map((card) =>
          patches.has(card.id) ? { ...card, ...patches.get(card.id) } : card),
      };
    }
    change(current.current, false);
  }
  // Finds the card edge an endpoint should attach to. A card the pointer is
  // over wins (smallest first), otherwise the nearest edge within a short reach.
  // Edges also pull gently to their midpoint, and Alt turns snapping off.
  function nearestCardEdge(point: Point, lineId: string) {
    const reach = 18 / zoom;
    const middle = 10 / zoom;
    type Hit = {
      inside: boolean;
      area: number;
      distance: number;
      point: Point;
      cardId: string;
      connection: NonNullable<BoardCard["line_start_connection"]>;
    };
    let best: Hit | undefined;
    for (const card of current.current.cards) {
      if (card.id === lineId || card.kind === "line") continue;
      const h = cardHeight(card, viewport.current);
      const inside = point.x >= card.x && point.x <= card.x + card.width && point.y >= card.y && point.y <= card.y + h;
      for (const edge of ["top", "bottom", "left", "right"] as const) {
        const horizontal = edge === "top" || edge === "bottom";
        const length = horizontal ? card.width : h;
        const along = horizontal ? point.x - card.x : point.y - card.y;
        const clamped = Math.max(0, Math.min(length, along));
        const offset = (Math.abs(clamped - length / 2) <= middle ? length / 2 : clamped) / length;
        const edgePoint =
          edge === "top" ? { x: card.x + card.width * offset, y: card.y }
          : edge === "bottom" ? { x: card.x + card.width * offset, y: card.y + h }
          : edge === "left" ? { x: card.x, y: card.y + h * offset }
          : { x: card.x + card.width, y: card.y + h * offset };
        const distance = Math.hypot(point.x - edgePoint.x, point.y - edgePoint.y);
        if (!inside && distance > reach) continue;
        const hit: Hit = {
          inside,
          area: card.width * h,
          distance,
          point: edgePoint,
          cardId: card.id,
          connection: { card_id: card.id, edge, offset },
        };
        const better =
          !best ||
          (hit.inside && !best.inside) ||
          (hit.inside === best.inside &&
            (hit.inside && hit.cardId !== best.cardId
              ? hit.area < best.area
              : hit.distance < best.distance));
        if (better) best = hit;
      }
    }
    return best;
  }
  function startLineDrag(e: PointerEvent<HTMLElement>, card: BoardCard, mode: LineEnd | "bend") {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const points = linePoints(card, current.current.cards, viewport.current);
    undo.current = [...undo.current.slice(-39), current.current];
    redo.current = [];
    const grabbed = canvasPoint(e.clientX, e.clientY);
    lineDrag.current = {
      id: card.id,
      mode,
      fixed: mode === "start" ? points.end : points.start,
      start: points.start,
      end: points.end,
      grab: mode === "bend" ? { x: grabbed.x - points.apex.x, y: grabbed.y - points.apex.y } : { x: 0, y: 0 },
    };
    selectCard(card.id);
  }
  function moveLineDrag(e: PointerEvent<HTMLElement>) {
    const active = lineDrag.current;
    if (!active) return;
    const card = current.current.cards.find((item) => item.id === active.id);
    if (!card) return;
    const pointer = canvasPoint(e.clientX, e.clientY);
    let patch: Partial<BoardCard>;
    if (active.mode === "bend") {
      const dx = active.end.x - active.start.x;
      const dy = active.end.y - active.start.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const midpoint = { x: (active.start.x + active.end.x) / 2, y: (active.start.y + active.end.y) / 2 };
      // The handle sits on the curve, which is halfway to the control point, so
      // the control point goes twice as far as the pointer from the midpoint.
      const ox = (pointer.x - active.grab.x - midpoint.x) * 2;
      const oy = (pointer.y - active.grab.y - midpoint.y) * 2;
      const clampCurve = (value: number) => Math.round(Math.max(-2000, Math.min(2000, value)) * 10) / 10;
      patch = card.line_routing === "elbow"
        ? { line_bend: null, line_shift: clampCurve(pointer.x - active.grab.x - midpoint.x) }
        : {
            line_bend: clampCurve((ox * -dy + oy * dx) / length),
            line_shift: clampCurve((ox * dx + oy * dy) / length),
          };
    } else {
      let target = pointer;
      if (e.shiftKey) {
        const dx = pointer.x - active.fixed.x;
        const dy = pointer.y - active.fixed.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        target = { x: active.fixed.x + Math.cos(angle) * length, y: active.fixed.y + Math.sin(angle) * length };
      }
      const snapped = e.altKey || !canvasPrefsRef.current.snap ? undefined : nearestCardEdge(target, card.id);
      setSnapTarget(snapped ? { cardId: snapped.cardId, point: snapped.point } : null);
      const prefix = active.mode === "start" ? "line_start" : "line_end";
      patch = {
        [`${prefix}_x`]: Math.max(0, Math.min(10000, snapped?.point.x ?? target.x)),
        [`${prefix}_y`]: Math.max(0, Math.min(10000, snapped?.point.y ?? target.y)),
        [`${prefix}_connection`]: snapped?.connection ?? null,
      } as Partial<BoardCard>;
    }
    const cards = current.current.cards.map((item) => item.id === card.id ? { ...item, ...patch } : item);
    current.current = { ...current.current, cards };
    setBoard(current.current);
  }
  function endLineDrag(e: PointerEvent<HTMLElement>) {
    if (!lineDrag.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    lineDrag.current = null;
    setSnapTarget(null);
    change(current.current, false);
  }
  function straightenLine(card: BoardCard) {
    if (!card.line_bend && !card.line_shift) return;
    updateCard({ ...card, line_bend: null, line_shift: null });
  }
  async function leave() {
    if (!(await commit())) return;
    writeTrail([]);
    go("/boards");
  }
  async function deleteBoard() {
    setBusy(true);
    try {
      if (!(await commit())) return;
      if (demo) demoMoveToTrash(board.id);
      else
        await api("/api/boards", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: board.id,
            revision: current.current.revision,
          }),
        });
      dirty.current = false;
      localStorage.removeItem(draftKey);
      if (trail.length) void openCrumb(trail.length - 1);
      else go("/boards");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete board.");
    } finally {
      setBusy(false);
    }
  }
  const collapsedColumns = new Set(
    board.cards
      .filter((card) => card.kind === "column" && card.collapsed)
      .map((card) => card.id),
  );
  const canvasCards = board.cards
    .filter((card) => !card.parent_id || !collapsedColumns.has(card.parent_id))
    .map((card, order) => ({ card, order }))
    .sort((a, b) =>
      a.card.kind === "column" && b.card.kind !== "column"
        ? -1
        : a.card.kind !== "column" && b.card.kind === "column"
          ? 1
          : a.order - b.order,
    )
    .map(({ card }) => card);
  const cards = canvasCards;
  // Search and tag filter: cards that match stay lit, everything else fades.
  const allTags = [...new Set(board.cards.flatMap((card) => card.tags))].sort();
  const filtering = searchOpen && (searchQuery.trim() !== "" || tagFilter.length > 0);
  const matches = filtering
    ? board.cards
        .filter((card) => cardMatches(card, searchQuery, tagFilter))
        .sort((a, b) => (a.parent_id ? 0 : a.y) - (b.parent_id ? 0 : b.y) || a.x - b.x)
    : [];
  const matchSet = filtering ? new Set(matches.map((card) => card.id)) : null;
  // A column stays lit while any of its cards matches.
  const lit = new Set(matches.flatMap((card) => (card.parent_id ? [card.id, card.parent_id] : [card.id])));
  const dimmed = new Set(filtering ? board.cards.filter((card) => !lit.has(card.id)).map((card) => card.id) : []);
  const folded = (card: BoardCard) => card.collapsed && !["column", "group", "line"].includes(card.kind);
  const activeCard = selection.size === 1 ? board.cards.find((card) => selection.has(card.id)) : undefined;
  // The card toolbar floats above whatever is selected and follows it while it
  // moves, scrolls or zooms. "More" opens the detailed options beneath it.
  const workspace = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  // Hovering a heading style or font previews it on the card without saving.
  const [headingPreview, setHeadingPreview] = useState<{ id: string; patch: Partial<BoardCard> } | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; up: boolean; room: number; above: boolean; roomAbove: number } | null>(null);
  const selectionKey = selection.size > 1 ? [...selection].join(",") : activeCard?.id ?? "";
  useEffect(() => { setMoreOpen(false); setStyleOpen(false); setHeadingPreview(null); }, [selectionKey]);
  useEffect(() => {
    if (!styleOpen) return;
    const close = (e: globalThis.PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".board-style-popover,.board-style-trigger")) { setStyleOpen(false); setHeadingPreview(null); }
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setStyleOpen(false); setHeadingPreview(null); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [styleOpen]);
  useEffect(() => {
    const ids = selectionKey ? selectionKey.split(",") : [];
    if (view !== "canvas" || !ids.length) { setAnchor(null); return; }
    let frame = 0;
    let last = "";
    const track = () => {
      const area = workspace.current?.getBoundingClientRect();
      const canvas = viewport.current?.getBoundingClientRect();
      if (area && canvas) {
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const id of ids) {
          const rect = viewport.current?.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.getBoundingClientRect();
          if (!rect) continue;
          left = Math.min(left, rect.left); top = Math.min(top, rect.top);
          right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
        }
        if (left !== Infinity) {
          const half = 200;
          const x = Math.min(Math.max((left + right) / 2, canvas.left + half), Math.max(canvas.left + half, canvas.right - half));
          const above = top - canvas.top > (searchOpen ? 120 : 52);
          const barHeight = workspace.current?.querySelector<HTMLElement>(".board-float-bar")?.offsetHeight ?? 42;
          // Leave room under the find bar when it is open.
          const floor = canvas.top + (searchOpen ? 74 : 6);
          const y = Math.min(Math.max(above ? top - barHeight - 6 : bottom + 8, floor), canvas.bottom - barHeight - 8);
          // Open the detail popover on whichever side of the bar has more room.
          const below = canvas.bottom - (y + barHeight) - 10;
          const upward = y - canvas.top - 10;
          const up = below < 220 && upward > below;
          const next = {
            left: Math.round(x - area.left),
            top: Math.round(y - area.top),
            up,
            room: Math.max(120, Math.round(up ? upward : below)),
            above,
            roomAbove: Math.round(upward),
          };
          const key = `${next.left},${next.top},${next.up},${next.room},${next.above},${next.roomAbove}`;
          if (key !== last) { last = key; setAnchor(next); }
        }
      }
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [selectionKey, view, searchOpen]);
  const width = Math.max(1200, ...board.cards.map((c) => c.x + c.width + 100));
  const height = Math.max(
    750,
    ...board.cards.map((c) => c.y + (c.height ?? 600) + 100),
  );
  const selectedCards = board.cards.filter((card) => selection.has(card.id) && card.kind !== "line");
  const selectionBounds = selectedCards.length > 1
    ? {
        x: Math.min(...selectedCards.map((card) => card.x)),
        y: Math.min(...selectedCards.map((card) => card.y)),
        width: Math.max(...selectedCards.map((card) => card.x + card.width)) - Math.min(...selectedCards.map((card) => card.x)),
        height: Math.max(...selectedCards.map((card) => card.y + cardHeight(card, viewport.current))) - Math.min(...selectedCards.map((card) => card.y)),
      }
    : null;
  const miniScale = Math.min(160 / width, 100 / height);
  // Centers the viewport on the pointer, clamped to the drawn map so dead space can't scroll off-board.
  function panFromMinimap(e: React.PointerEvent<HTMLButtonElement>) {
    const el = viewport.current;
    const map = e.currentTarget.querySelector<HTMLElement>(".board-minimap-map");
    if (!el || !map) return;
    const rect = map.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width) / miniScale;
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height) / miniScale;
    el.scrollLeft = Math.max(0, x * zoom - el.clientWidth / 2);
    el.scrollTop = Math.max(0, y * zoom - el.clientHeight / 2);
  }
  void historyVersion;
  return (
    <section
      className={`boards-page board-editor ${focusMode ? "is-focus" : ""}`}
      onCopy={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,[contenteditable=true]",
          ) ||
          window.getSelection()?.toString()
        )
          return;
        const cards = selectionWith();
        if (!cards.length) return;
        e.preventDefault();
        clipboard.current = cards;
        e.clipboardData.setData("text/plain", payload(cards));
        setNotice(cards.length === 1 ? "Card copied." : `${cards.length} cards copied.`);
      }}
      onCut={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,[contenteditable=true]",
          ) ||
          window.getSelection()?.toString()
        )
          return;
        const cards = selectionWith();
        if (!cards.length) return;
        e.preventDefault();
        clipboard.current = cards;
        e.clipboardData.setData("text/plain", payload(cards));
        trashMany(cards.map((card) => card.id));
      }}
      onPaste={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,[contenteditable=true]",
          )
        )
          return;
        if (view !== "canvas") return;
        if (e.clipboardData.files.length) {
          e.preventDefault();
          void uploadFiles(Array.from(e.clipboardData.files), visiblePoint());
        } else if (pasteText(e.clipboardData.getData("text/plain")))
          e.preventDefault();
      }}
    >
      <div className="board-editor-bar">
        <IconButton
          label={trail.length ? `Back to ${trail.at(-1)!.title}` : "Back to boards"}
          disabled={uploadCount > 0}
          onClick={() => (trail.length ? void openCrumb(trail.length - 1) : void leave())}
        >
          <ArrowLeft size={19} />
        </IconButton>
        <div className="board-title-block">
          {trail.length > 0 && (
            <nav className="board-breadcrumbs" aria-label="Board path">
              <button disabled={uploadCount > 0} onClick={() => void leave()}>Boards</button>
              {trail.map((crumb, index) => (
                <span key={crumb.id}>
                  <ChevronRight size={12} aria-hidden="true" />
                  <button disabled={uploadCount > 0} onClick={() => void openCrumb(index)}>{crumb.title}</button>
                </span>
              ))}
            </nav>
          )}
          {editingTitle ? (
            <input
              className="board-title-input"
              aria-label="Board name"
              autoFocus
              maxLength={200}
              value={titleDraft}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                const title = titleDraft.trim();
                setEditingTitle(false);
                if (title && title !== board.title) change({ ...current.current, title });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setTitleDraft(board.title); setEditingTitle(false); }
              }}
            />
          ) : (
            <button
              className="board-title-button"
              title="Rename board"
              onClick={() => { setTitleDraft(board.title); setEditingTitle(true); }}
            >
              <h1>{board.title}</h1>
              <Pencil size={13} aria-hidden="true" />
            </button>
          )}
          <p>
            {board.cards.length} {board.cards.length === 1 ? "card" : "cards"}
            <span aria-hidden="true"> · </span>
            <span
              className={`board-save-status ${error ? "has-error" : ""}`}
              data-state={error || status.startsWith("Not saved") ? "error" : status === "Saving…" ? "saving" : status === "Saved" ? "saved" : "dirty"}
              role="status"
            >
              {status === "Saved" && savedAt ? savedLabel(savedAt, clock) : status}
            </span>
          </p>
        </div>
        <div className="board-history">
          <IconButton label="Undo" disabled={!undo.current.length} onClick={() => history(true)}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton label="Redo" disabled={!redo.current.length} onClick={() => history(false)}>
            <Redo2 size={16} />
          </IconButton>
        </div>
        <IconButton label="Search board" onClick={() => setSearchOpen((open) => !open)}>
          <Search size={16} />
        </IconButton>
        <IconButton label={focusMode ? "Exit focus mode" : "Focus mode"} onClick={() => setFocusMode((on) => !on)}>
          <Maximize2 size={16} />
        </IconButton>
        <button
          className="icon-btn"
          aria-label="Board menu"
          aria-haspopup="menu"
          aria-expanded={Boolean(boardMenu)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setBoardMenu(boardMenu ? null : { x: rect.right - 220, y: rect.bottom + 6 });
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      {error && (
        <div className="board-error" role="alert">
          <span>{error}</span>
          <Button
            onClick={() => {
              if (!blocked.current) void commit();
              else {
                download(current.current);
              }
            }}
          >
            {blocked.current ? "Download draft" : "Retry save"}
          </Button>
          {blocked.current && (
            <Button
              onClick={async () => {
                if (
                  !window.confirm(
                    "Load the saved board? Download your draft first to keep your local changes.",
                  )
                )
                  return;
                dirty.current = false;
                localStorage.removeItem(draftKey);
                await onReload();
              }}
            >
              Load saved board
            </Button>
          )}
        </div>
      )}
      {uploadError && (
        <div className="board-error" role="alert">
          <span>{uploadError}</span>
          <Button onClick={() => setUploadError("")}>Dismiss</Button>
        </div>
      )}
      <div className="board-workspace" ref={workspace}>
        <aside className="board-tools" aria-label="Add cards">
          <div className="board-tool-list">
            {TOOL_GROUPS.map((group) => <div className="board-tool-group" role="group" aria-label={group.name} key={group.name}>
            {group.kinds.map((kind) => {
              const Icon = icons[kind];
              return (
                <button
                  key={kind}
                  draggable={view === "canvas"}
                  aria-label={labels[kind]}
                  aria-keyshortcuts={TOOL_KEYS[kind]}
                  title={`${labels[kind]}${TOOL_KEYS[kind] ? ` (${TOOL_KEYS[kind]})` : ""}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TOOL_MIME, kind);
                    e.dataTransfer.effectAllowed = "copy";
                    draggedTool.current = kind;
                    // The ghost on the canvas is the preview, so hide the browser's own drag image.
                    const blank = document.createElement("canvas");
                    blank.width = blank.height = 1;
                    blank.style.cssText = "position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none";
                    document.body.appendChild(blank);
                    e.dataTransfer.setDragImage(blank, 0, 0);
                    setTimeout(() => blank.remove(), 0);
                  }}
                  onDragEnd={() => { toolDragEnded.current = Date.now(); draggedTool.current = null; setGhost(null); }}
                  onClick={() =>
                    { if (Date.now() - toolDragEnded.current > 300) add(kind); }
                  }
                >
                  <Icon size={18} />
                  <span aria-hidden="true">{TOOL_SHORT[kind] ?? labels[kind]}</span>
                </button>
              );
            })}
            </div>)}
            <input
              ref={uploadInput}
              type="file"
              multiple
              hidden
              accept={[...BOARD_ASSET_TYPES].join(",")}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                if (files.length) void uploadFiles(files, uploadPoint.current ?? visiblePoint());
              }}
            />
          </div>
          <div className="board-tool-pinned">
            <button
              title="Upload files"
              aria-label="Upload"
              disabled={uploadCount > 0}
              onClick={() => {
                uploadPoint.current = visiblePoint();
                uploadInput.current?.click();
              }}
            >
              <Upload size={18} />
              <span>Upload</span>
            </button>
            <div
              ref={trashZone}
              className={`board-trash-zone ${trashHover ? "is-hover" : ""}`}
            >
              <button
                onClick={() => setTrashOpen(true)}
                title="Drag cards here to delete them"
                aria-label={board.trash.length > 0 ? `Trash, ${board.trash.length} ${board.trash.length === 1 ? "item" : "items"}` : "Trash"}
              >
                <Trash2 size={18} />
                <span className="tool-label">Trash</span>
                {board.trash.length > 0 && <b>{board.trash.length}</b>}
              </button>
            </div>
          </div>
        </aside>
        {searchOpen && (
          <BoardSearchBar
            query={searchQuery}
            tags={allTags}
            activeTags={tagFilter}
            count={matches.length}
            index={matchIndex}
            onQuery={(value) => {
              setSearchQuery(value);
              setMatchIndex(0);
            }}
            onToggleTag={(tag) => {
              setTagFilter((list) => (list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag]));
              setMatchIndex(0);
            }}
            onStep={stepMatch}
            onClose={() => {
              setSearchOpen(false);
              setSearchQuery("");
              setTagFilter([]);
              viewport.current?.focus();
            }}
          />
        )}
        {view === "canvas" && (
          <div className="board-zoom board-zoom-float" role="group" aria-label="Zoom">
            <IconButton label="Zoom out" disabled={zoom <= 0.2} onClick={() => zoomAt(zoomRef.current - 0.1)}>
              <ZoomOut size={16} />
            </IconButton>
            <button onClick={() => zoomAt(1)} aria-label="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Zoom in" disabled={zoom >= 3} onClick={() => zoomAt(zoomRef.current + 0.1)}>
              <ZoomIn size={16} />
            </IconButton>
            <Button onClick={fitBoard} disabled={!board.cards.length}>
              Fit board
            </Button>
            <IconButton label="Canvas settings" className="board-canvas-trigger" onClick={() => setCanvasPanel((open) => !open)}>
              <Grid3x3 size={16} />
            </IconButton>
          </div>
        )}
        {view === "canvas" && canvasPanel && (
          <CanvasPanel
            background={board.background}
            prefs={canvasPrefs}
            onBackground={(background) => change({ ...current.current, background })}
            onPrefs={updateCanvasPrefs}
            onClose={() => setCanvasPanel(false)}
          />
        )}
        {view === "canvas" && canvasPrefs.ruler && (
          <CanvasRulers
            scrollLeft={viewportScroll.left}
            scrollTop={viewportScroll.top}
            zoom={zoom}
            width={viewport.current?.clientWidth ?? 1000}
            height={viewport.current?.clientHeight ?? 600}
          />
        )}
        {focusMode && (
          <button className="board-focus-exit" onClick={() => setFocusMode(false)}>
            <Minimize2 size={14} />
            Exit focus mode
          </button>
        )}
        <div
          ref={viewport}
          tabIndex={0}
          aria-label="Board canvas"
          className={`board-viewport ${view} board-bg-${board.background} ${canvasPrefs.grid ? "" : "board-grid-off"} ${dropActive ? "board-drop-active" : ""} ${spaceDown ? "board-pan-ready" : ""} ${panning ? "board-panning" : ""}`}
          onPointerDownCapture={(e) => {
            if (view !== "canvas" || e.button !== 0) return;
            if (spacePressed.current) {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              pan.current = {
                pointerId: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                left: e.currentTarget.scrollLeft,
                top: e.currentTarget.scrollTop,
              };
              setPanning(true);
              return;
            }
            if (
              (e.target as HTMLElement).closest(
                ".board-card,button,input,textarea,select,[contenteditable=true]",
              )
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            // preventDefault skips native focus; keep keyboard paste working.
            e.currentTarget.focus({ preventScroll: true });
            e.currentTarget.setPointerCapture(e.pointerId);
            const start = canvasPoint(e.clientX, e.clientY);
            marqueeDrag.current = {
              pointerId: e.pointerId,
              start,
              additive: e.shiftKey,
              base: e.shiftKey ? new Set(selection) : new Set(),
            };
            if (!e.shiftKey) {
              setSelection(new Set());
              setSelected(null);
            }
            setMarquee({ x: start.x, y: start.y, width: 0, height: 0 });
          }}
          onPointerMove={(e) => {
            const active = pan.current;
            if (active?.pointerId === e.pointerId) {
              e.currentTarget.scrollLeft = active.left - (e.clientX - active.x);
              e.currentTarget.scrollTop = active.top - (e.clientY - active.y);
              return;
            }
            const selecting = marqueeDrag.current;
            if (!selecting || selecting.pointerId !== e.pointerId) return;
            const point = canvasPoint(e.clientX, e.clientY);
            const rect = {
              x: Math.min(selecting.start.x, point.x),
              y: Math.min(selecting.start.y, point.y),
              width: Math.abs(point.x - selecting.start.x),
              height: Math.abs(point.y - selecting.start.y),
            };
            setMarquee(rect);
            const hits = current.current.cards
              .filter((card) => {
                if (card.kind === "line") {
                  // Lines are hit by their drawn path, not their padded box.
                  const { start, end, control } = linePoints(card, current.current.cards, viewport.current);
                  const samples = Array.from({ length: 33 }, (_, i) => {
                    const t = i / 32;
                    return {
                      x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x,
                      y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y,
                    };
                  });
                  return samples.some((p) => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height);
                }
                const h = cardHeight(card, viewport.current);
                return (
                  card.x < rect.x + rect.width &&
                  card.x + card.width > rect.x &&
                  card.y < rect.y + rect.height &&
                  card.y + h > rect.y
                );
              })
              .map((card) => card.id);
            setSelection(
              new Set(selecting.additive ? [...selecting.base, ...hits] : hits),
            );
            setSelected(hits.at(-1) || null);
          }}
          onPointerUp={(e) => {
            const wasPanning = pan.current?.pointerId === e.pointerId;
            const wasSelecting = marqueeDrag.current?.pointerId === e.pointerId;
            if (!wasPanning && !wasSelecting) return;
            if (wasPanning) pan.current = null;
            if (wasSelecting) {
              marqueeDrag.current = null;
              setMarquee(null);
            }
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (wasPanning) setPanning(false);
          }}
          onPointerCancel={(e) => {
            if (pan.current?.pointerId === e.pointerId) {
              pan.current = null;
              setPanning(false);
            }
            if (marqueeDrag.current?.pointerId === e.pointerId) {
              marqueeDrag.current = null;
              setMarquee(null);
            }
          }}
          onScroll={(e) =>
            setViewportScroll({
              left: e.currentTarget.scrollLeft,
              top: e.currentTarget.scrollTop,
            })
          }
          onDragEnter={(e) => {
            if (acceptsDrop(e)) {
              e.preventDefault();
              dropDepth.current++;
              setDropActive(true);
            }
          }}
          onDragLeave={() => {
            dropDepth.current = Math.max(0, dropDepth.current - 1);
            if (!dropDepth.current) { setDropActive(false); setGhost(null); }
          }}
          onDragOver={(e) => {
            if (acceptsDrop(e)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              // Tools carry their kind in a ref (drag data is unreadable until drop); files are guessed from their types.
              let kind = draggedTool.current;
              let files = 0;
              if (!kind && e.dataTransfer.types.includes("Files")) {
                const items = Array.from(e.dataTransfer.items || []);
                files = items.length || 1;
                kind = items.length && items.every((item) => item.type.startsWith("image/")) ? "image"
                  : items.length && items.every((item) => item.type.startsWith("video/")) ? "video" : "file";
              }
              if (kind && kind !== "line" && kind !== "board") {
                const point = canvasPoint(e.clientX, e.clientY);
                setGhost((previous) =>
                  previous && previous.kind === kind && previous.x === point.x && previous.y === point.y && previous.files === files
                    ? previous
                    : { kind: kind!, ...point, files });
              } else setGhost(null);
            }
          }}
          onDrop={drop}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest(".board-card,button,input,textarea,a")) add("note", canvasPoint(e.clientX, e.clientY));
          }}
          onContextMenu={(e) => {
            if (!(e.target as HTMLElement).closest(".board-card")) {
              e.preventDefault();
              openMenu(null, e.clientX, e.clientY, e.currentTarget);
            }
          }}
        >
          {dropActive && !ghost && (
            <div className="board-drop-hint">Drop to add to your board</div>
          )}
          {uploadCount > 0 && (
            <div className="board-upload-status" role="status">
              Uploading {uploadCount} image{uploadCount === 1 ? "" : "s"}…
            </div>
          )}
          {!cards.length && (
            <div className="board-canvas-empty">
              <span className="board-canvas-empty-icon"><PanelsTopLeft size={28} /></span>
              <h2>Every good edit starts with an idea</h2>
              <p>Double-click anywhere for a note, drag a tool from the left, or drop in images and links.</p>
              <Button onClick={() => add("note")}>
                <Plus size={16} />
                Add your first note
              </Button>
            </div>
          )}
          <div
            className={
              view === "canvas" ? "board-canvas-size" : "board-story-grid"
            }
            style={
              view === "canvas"
                ? { width: width * zoom, height: height * zoom }
                : undefined
            }
          >
            <div
              className={
                view === "canvas" ? "board-canvas" : "board-story-cards"
              }
              style={
                view === "canvas"
                  ? { width, height, transform: `scale(${zoom})` }
                  : undefined
              }
            >
              {view === "canvas" && guides.x !== undefined && (
                <div className="board-guide board-guide-x" style={{ left: guides.x }} />
              )}
              {view === "canvas" && snapTarget && (
                <div className="board-snap-dot" style={{ left: snapTarget.point.x, top: snapTarget.point.y }} />
              )}
              {view === "canvas" && guides.y !== undefined && (
                <div className="board-guide board-guide-y" style={{ top: guides.y }} />
              )}
              {view === "canvas" && dropTarget && (
                <div className="board-column-drop" style={{ left: dropTarget.x, top: dropTarget.y - 2, width: dropTarget.width }} />
              )}
              {view === "canvas" && marquee && (
                <div className="board-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />
              )}
              {view === "canvas" && selectionBounds && (
                <div className="board-group-bounds" style={{ left: selectionBounds.x - 6, top: selectionBounds.y - 6, width: selectionBounds.width + 12, height: selectionBounds.height + 12 }}>
                  <button
                    aria-label="Resize selected cards"
                    onPointerDown={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      groupResize.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, bounds: selectionBounds, cards: selectedCards.map((card) => ({ ...card })) };
                      undo.current = [...undo.current.slice(-39), current.current]; redo.current = [];
                    }}
                    onPointerMove={(e) => {
                      const active = groupResize.current;
                      if (!active || active.pointerId !== e.pointerId) return;
                      const sx = Math.max(.25, (active.bounds.width + (e.clientX - active.x) / zoom) / active.bounds.width);
                      const sy = Math.max(.25, (active.bounds.height + (e.clientY - active.y) / zoom) / active.bounds.height);
                      const updates = new globalThis.Map(active.cards.map((card) => [card.id, { ...card, x: active.bounds.x + (card.x - active.bounds.x) * sx, y: active.bounds.y + (card.y - active.bounds.y) * sy, width: Math.max(220, card.width * sx), height: card.kind === "group" ? null : Math.max(40, cardHeight(card, viewport.current) * sy) }]));
                      const next = { ...current.current, cards: current.current.cards.map((card) => updates.get(card.id) || card) };
                      current.current = next; setBoard(next); dirty.current = true; setStatus("Unsaved changes");
                    }}
                    onPointerUp={(e) => { if (groupResize.current) { groupResize.current = null; change(current.current, false); } e.currentTarget.releasePointerCapture(e.pointerId); }}
                  >◢</button>
                </div>
              )}
              {view === "canvas" && ghost && <GhostCard kind={ghost.kind} x={ghost.x} y={ghost.y} files={ghost.files} />}
              {view === "canvas" && drag.current?.moved && !drag.current.resize && drag.current.positions.map((origin) => {
                const moved = cards.find((item) => item.id === origin.id);
                if (!moved || moved.kind === "line") return null;
                return <div key={origin.id} className="board-ghost-origin" aria-hidden="true"
                  style={{ left: origin.x, top: origin.y, width: moved.width, height: cardHeight(moved, viewport.current) }} />;
              })}
              {view === "canvas" && pending.map((item) => (
                <div
                  key={item.id}
                  className={`board-pending ${item.stage === "error" ? "is-error" : ""}`}
                  style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
                  role={item.stage === "error" ? "alert" : "status"}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {item.preview && item.stage !== "error" && <img src={item.preview} alt="" draggable={false} />}
                  {item.stage === "uploading" && (
                    <div
                      className="board-pending-bar"
                      role="progressbar"
                      aria-label={`Uploading ${item.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(item.progress * 100)}
                    >
                      <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    </div>
                  )}
                  <div className="board-pending-info">
                    {item.stage === "error" ? (
                      <>
                        <span>{item.error}</span>
                        <span className="board-pending-actions">
                          <button onClick={() => retryUpload(item)}>Retry</button>
                          <button onClick={() => dropPending(item.id)}>Remove</button>
                        </span>
                      </>
                    ) : (
                      <>
                        <i className="board-pending-spinner" aria-hidden="true" />
                        <span>
                          {item.stage === "preparing" ? "Preparing" : "Uploading"} {item.name}
                          {item.stage === "uploading" && item.progress > 0 && ` · ${Math.round(item.progress * 100)}%`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {cards.map((card, index) => {
                const Icon = icons[card.kind];
                const look = headingPreview?.id === card.id ? { ...card, ...headingPreview.patch } : card;
                const geometry =
                  card.kind === "line"
                    ? linePoints(card, board.cards, viewport.current)
                    : null;
                const pathData = geometry
                  ? linePathData({
                      start: geometry.start,
                      end: geometry.end,
                      bend: card.line_bend ?? 0,
                      shift: card.line_shift ?? 0,
                      routing: card.line_routing,
                      sketchy: card.sketchy,
                      seed: card.shape_seed,
                    }).d
                  : "";
                return (
                  <article
                    key={card.id}
                    data-card-id={card.id}
                    tabIndex={0}
                    aria-label={card.title || labels[card.kind]}
                    data-selected={selection.has(card.id)}
                    data-snap-target={snapTarget?.cardId === card.id || undefined}
                    data-drop-target={dropTarget?.column === card.id || undefined}
                    data-in-column={!!card.parent_id || undefined}
                    data-locked={card.locked || undefined}
                    data-dim={dimmed.has(card.id) || undefined}
                    data-match={matchSet?.has(card.id) || undefined}
                    onPointerDownCapture={(e) => {
                      if ((e.target as HTMLElement).closest("a,input,textarea,select,button,video,audio,[contenteditable=true]"))
                        selectCard(card.id);
                    }}
                    onPointerDown={(e) => {
                      const poster = (e.target as HTMLElement).closest<HTMLElement>(".board-embed-poster");
                      posterPress.current = poster ? { el: poster, x: e.clientX, y: e.clientY } : null;
                      if (
                        !(e.target as HTMLElement).closest(
                          "input,textarea,select,summary,button:not(.board-embed-poster),a,video,audio,[contenteditable=true]",
                        )
                      ) {
                        selectCard(card.id, e.shiftKey);
                        if (card.kind !== "line" && !e.shiftKey)
                          startDrag(e, card, false, true);
                      }
                    }}
                    onPointerMove={(e) => {
                      if (card.kind !== "line") moveDrag(e);
                    }}
                    onPointerUp={(e) => {
                      const press = posterPress.current;
                      posterPress.current = null;
                      if (card.kind !== "line") endDrag();
                      if (press && !e.shiftKey && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) press.el.click();
                    }}
                    onPointerCancel={() => {
                      if (card.kind !== "line") endDrag();
                    }}
                    onDoubleClick={(e) => {
                      if (card.kind === "line") return;
                      if (folded(card)) {
                        e.preventDefault();
                        updateCard({ ...card, collapsed: false });
                        return;
                      }
                      if (card.kind === "board" && card.target_board_id && editing?.id !== card.id) {
                        e.preventDefault();
                        void openBoard(card.target_board_id);
                        return;
                      }
                      if (
                        !(e.target as HTMLElement).closest(
                          "input,textarea,select,button,a,video,audio,.board-card-actions,.board-inline-editor",
                        )
                      )
                        beginEditing(card);
                    }}
                    onFocus={(e) => {
                      selectCard(card.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openMenu(card.id, e.clientX, e.clientY, e.currentTarget);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (
                        e.key === "ContextMenu" ||
                        (e.shiftKey && e.key === "F10")
                      ) {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        openMenu(
                          card.id,
                          r.left + 20,
                          r.top + 20,
                          e.currentTarget,
                        );
                      }
                    }}
                    onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    className={`board-card board-card-${card.color} board-card-${card.kind} ${card.kind === "group" ? `board-heading-${look.heading_size} board-font-${look.heading_font}` : ""}`}
                    style={
                      view === "canvas"
                        ? {
                            left: geometry?.left ?? card.x,
                            top: geometry?.top ?? card.y,
                            width: geometry?.width ?? card.width,
                            height:
                              geometry?.height ??
                              (card.kind === "column" && card.collapsed
                                ? 48
                                : folded(card)
                                  ? undefined
                                  : card.height ?? undefined),
                            zIndex: index + 1 + (selection.has(card.id) && card.kind !== "column" ? cards.length : 0),
                            ...cardStyle(card),
                            ...(card.kind === "group" ? { backgroundColor: "transparent" } : {}),
                          }
                        : cardStyle(card)
                    }
                  >
                    {card.kind === "line" && <div className="board-card-header">
                      <span>
                        <Icon size={14} />
                        {labels[card.kind]}
                      </span>
                      {view === "canvas" && card.kind !== "line" && (
                        <div className="board-card-header-controls">
                        {card.kind === "column" && (
                          <button
                            className="board-column-toggle"
                            aria-label={card.collapsed ? "Expand column" : "Collapse column"}
                            onClick={() => updateCard({ ...card, collapsed: !card.collapsed })}
                          >
                            {card.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                          </button>
                        )}
                        <button
                          aria-label={`Move ${card.title || labels[card.kind]}`}
                          className="board-drag"
                          onPointerDown={(e) => startDrag(e, card)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          onKeyDown={(e) => {
                            const offsets: Record<string, [number, number]> = {
                              ArrowLeft: [-20, 0],
                              ArrowRight: [20, 0],
                              ArrowUp: [0, -20],
                              ArrowDown: [0, 20],
                            };
                            const o = offsets[e.key];
                            if (o) {
                              e.preventDefault();
                              e.stopPropagation();
                              updateCard({
                                ...card,
                                x: Math.min(10000, Math.max(0, card.x + o[0])),
                                y: Math.min(10000, Math.max(0, card.y + o[1])),
                              });
                            }
                          }}
                        >
                          <GripHorizontal size={18} />
                        </button>
                        </div>
                      )}
                    </div>}
                    <div className="board-card-scroll">
                      {folded(card) && editing?.id !== card.id ? (
                        <CollapsedCard card={card} icon={icons[card.kind]} label={labels[card.kind]} onExpand={() => updateCard({ ...card, collapsed: false })} />
                      ) : card.kind === "group" ? (
                        editing?.id === card.id ? <HeadingEditor card={look} onChange={(patch) => inlineChange(card.id, patch)} onClose={() => closeEditing(card.id)} />
                        : <h2 className="board-heading-text" style={{ textAlign: card.heading_align, ...headingFontStyle(look) }}>{card.title || "Heading"}</h2>
                      ) : card.kind === "checklist" ? <TodoCard card={card} editing={editing?.id === card.id} onClose={() => closeEditing(card.id)} onChange={(patch) => updateCard({ ...card, ...patch })} />
                        : editing?.id === card.id && card.kind === "note" ? (
                        <LiveNoteEditor
                          key={card.id}
                          body={card.body}
                          html={card.body_html}
                          onChange={(body, body_html) => inlineChange(card.id, { body, body_html })}
                          onClose={() => closeEditing(card.id)}
                        />
                      ) : card.kind === "shape" ? (
                        <ShapeCard card={card} editing={editing?.id === card.id} onChange={(patch) => inlineChange(card.id, patch)} onClose={() => closeEditing(card.id)} />
                      ) : editing?.id === card.id && card.kind !== "line" && card.kind !== "column" ? (
                        <InlineCardEditor
                          key={card.id}
                          card={card}
                          demo={demo}
                          boardChoices={boardChoices}
                          onClose={() => closeEditing(card.id)}
                          onChange={(patch) => inlineChange(card.id, patch)}
                        />
                      ) : card.kind === "link" ? <LinkCard card={card} assetImage={card.image ? boardAssetUrl(card.image) : ""} />
                      : card.kind === "video_link" || card.kind === "audio_link" ? <EmbedCard card={card} />
                        : card.kind === "line" && geometry ? (
                        <>
                          <svg
                            className="board-line-art"
                            width={geometry.width}
                            height={geometry.height}
                            viewBox={`${geometry.left} ${geometry.top} ${geometry.width} ${geometry.height}`}
                            aria-label="Line"
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (card.line_bend || card.line_shift) straightenLine(card);
                              else beginEditing(card);
                            }}
                          >
                            <defs>
                              {(() => {
                                // A standard arrowhead that grows with the line weight.
                                const size = 10 + card.line_weight * 2;
                                const style = card.line_arrow_style;
                                return (
                                  <marker id={`line-arrow-${card.id}`} viewBox="0 0 10 10" markerWidth={size} markerHeight={size}
                                    refX={style === "dot" ? 5 : style === "bar" ? 8 : 9} refY={5} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                                    {style === "open" ? <path d="M 1.2 1 L 9 5 L 1.2 9" fill="none" stroke={card.line_color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                      : style === "dot" ? <circle cx="5" cy="5" r="3.4" fill={card.line_color} />
                                      : style === "bar" ? <path d="M 8 0.8 L 8 9.2" stroke={card.line_color} strokeWidth="2" strokeLinecap="round" />
                                      : <path d="M 0 0.8 L 10 5 L 0 9.2 z" fill={card.line_color} />}
                                  </marker>
                                );
                              })()}
                            </defs>
                            <path
                              className="board-line-hit"
                              d={pathData}
                              fill="none"
                              stroke="transparent"
                              strokeWidth={Math.max(16, card.line_weight + 12)}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectCard(card.id);
                              }}
                            />
                            <path
                              className="board-line-visible"
                              d={pathData}
                              fill="none"
                              stroke={card.line_color}
                              strokeWidth={card.line_weight}
                              strokeDasharray={card.line_dashed ? "10 7" : undefined}
                              strokeLinecap="round"
                              markerStart={card.line_start_arrow ? `url(#line-arrow-${card.id})` : undefined}
                              markerEnd={card.line_end_arrow ? `url(#line-arrow-${card.id})` : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectCard(card.id);
                              }}
                            />
                          </svg>
                          {card.title && editing?.id !== card.id && (
                            <button
                              className="board-line-label"
                              title="Drag to curve the line · double-click to edit"
                              style={{
                                left: lineLabelPosition(geometry).x,
                                top: lineLabelPosition(geometry).y,
                                ...(card.label_color ? { color: card.label_color } : {}),
                                ...(card.label_background ? { background: card.label_background } : {}),
                              }}
                              onPointerDown={(e) => startLineDrag(e, card, "bend")}
                              onPointerMove={moveLineDrag}
                              onPointerUp={endLineDrag}
                              onPointerCancel={endLineDrag}
                              onDoubleClick={(e) => { e.stopPropagation(); beginEditing(card); }}
                            >
                              {card.title}
                            </button>
                          )}
                          {editing?.id === card.id && (
                            <input
                              autoFocus
                              className="board-line-label board-line-label-input"
                              aria-label="Edit line label"
                              maxLength={200}
                              value={card.title}
                              placeholder="Line label"
                              style={{
                                left: lineLabelPosition(geometry).x,
                                top: lineLabelPosition(geometry).y,
                                ...(card.label_color ? { color: card.label_color } : {}),
                                ...(card.label_background ? { background: card.label_background } : {}),
                              }}
                              onChange={(e) => inlineChange(card.id, { title: e.target.value })}
                              onBlur={() => setEditing(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") {
                                  e.preventDefault();
                                  setEditing(null);
                                }
                              }}
                            />
                          )}
                          {(["start", "end"] as const).map((end) => {
                            const point = geometry[end];
                            return (
                              <button
                                key={end}
                                className={`board-line-endpoint board-line-${end}`}
                                aria-label={`Move line ${end}`}
                                style={{ left: point.x - geometry.left, top: point.y - geometry.top }}
                                onPointerDown={(e) => startLineDrag(e, card, end)}
                                onPointerMove={moveLineDrag}
                                onPointerUp={endLineDrag}
                                onPointerCancel={endLineDrag}
                              />
                            );
                          })}
                          {!card.title && editing?.id !== card.id && <button
                            className="board-line-bend-handle"
                            aria-label="Curve line"
                            style={{ left: geometry.apex.x - geometry.left, top: geometry.apex.y - geometry.top }}
                            onPointerDown={(e) => startLineDrag(e, card, "bend")}
                            onPointerMove={moveLineDrag}
                            onPointerUp={endLineDrag}
                            onPointerCancel={endLineDrag}
                            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); straightenLine(card); }}
                          />}
                        </>
                      ) : card.kind === "column" ? (() => {
                          const count = columnChildren(board.cards, card.id).length;
                          return (
                            <div className="board-column-body">
                              <div className="board-column-header">
                                {editing?.id === card.id ? (
                                  <input
                                    className="board-column-title-input"
                                    aria-label="Column title"
                                    autoFocus
                                    maxLength={200}
                                    value={card.title}
                                    placeholder="Column"
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => inlineChange(card.id, { title: e.target.value })}
                                    onBlur={() => closeEditing(card.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === "Escape") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        closeEditing(card.id);
                                      }
                                    }}
                                  />
                                ) : (
                                  <strong>{card.title || "Column"}</strong>
                                )}
                                <span className="board-column-count">{count}</span>
                                <button className="board-column-toggle" aria-label={card.collapsed ? "Expand column" : "Collapse column"} onClick={() => updateCard({ ...card, collapsed: !card.collapsed })}>{card.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
                              </div>
                              {!card.collapsed && !count && (
                                <p className="board-column-empty">Drag cards here to stack them</p>
                              )}
                            </div>
                          );
                        })() : (
                        <>
                          {card.image && (
                            card.kind === "video" ? (
                              <video className="board-card-video" src={`${boardAssetUrl(card.image)}#t=0.1`} controls playsInline preload="metadata" />
                            ) : card.kind === "file" && card.file_type.startsWith("audio/") ? (
                              <AudioFileCard card={card} src={boardAssetUrl(card.image)} />
                            ) : card.kind === "image" || card.kind === "scene" ? (
                            <img
                              className="board-card-image"
                              src={boardAssetUrl(card.image)}
                              alt={card.title || "Board reference"}
                              draggable={false}
                              loading="lazy"
                              decoding="async"
                              onLoad={(e) => {
                                // An image card is exactly its picture. Older cards saved extra height (from the title
                                // and details that used to sit below), which would show as blank space.
                                const el = e.currentTarget;
                                if (card.kind !== "image" || card.height == null || card.image_fit !== "contain" || !el.naturalWidth) return;
                                const natural = (card.width * el.naturalHeight) / el.naturalWidth;
                                if (Math.abs(card.height - natural) > 2) inlineChange(card.id, { height: null });
                              }}
                              style={{ objectFit: card.image_fit, objectPosition: `${card.image_position_x}% ${card.image_position_y}%` }}
                            />
                            ) : null
                          )}
                          {card.kind === "color" && (
                            <div className="board-color-swatch" style={{ background: card.color_value }}>
                              <button
                                className="board-color-chip"
                                title="Copy color code"
                                aria-label={`Copy ${card.color_value.toUpperCase()}`}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void navigator.clipboard?.writeText(card.color_value.toUpperCase()).then(
                                    () => setNotice(`Copied ${card.color_value.toUpperCase()}`),
                                    () => setNotice("Couldn't copy. Select the code and copy it manually."),
                                  );
                                }}
                              >
                                {card.color_value.toUpperCase()}
                              </button>
                            </div>
                          )}
                          {card.kind === "file" && !card.file_type.startsWith("audio/") && (
                            <a className="board-file-preview" href={boardAssetUrl(card.image)} target="_blank" rel="noopener noreferrer">
                              <FileText size={30} />
                              <span>{card.file_name || card.title || "Board file"}</span>
                              <small>{fileSize(card.file_size)}</small>
                            </a>
                          )}
                          {card.kind === "board" && (() => {
                            const linked = boardChoices.find((item) => item.id === card.target_board_id);
                            return (
                              <button
                                className="board-nested-preview"
                                aria-label={card.target_board_id ? `Open ${card.title || "board"}` : "Choose a board"}
                                disabled={!card.target_board_id}
                                onClick={() => card.target_board_id && void openBoard(card.target_board_id)}
                              >
                                {linked?.preview?.length ? <BoardThumbnail cards={linked.preview} /> : (
                                  <span className="board-nested-icon"><LayoutPanelTop size={26} /></span>
                                )}
                                <small>
                                  {!card.target_board_id
                                    ? "Choose a board"
                                    : linked
                                      ? `${linked.card_count} ${linked.card_count === 1 ? "card" : "cards"}`
                                      : "Open board"}
                                </small>
                              </button>
                            );
                          })()}
                          {card.kind === "scene" && !card.image && (
                            <button
                              className="board-scene-placeholder"
                              onClick={() => beginEditing(card)}
                            >
                              <ImagePlus size={26} />
                              <span>Add a frame</span>
                            </button>
                          )}
                          {(() => {
                            // The audio card already shows its file name, so only a custom title is worth repeating.
                            const audioFile = card.kind === "file" && card.file_type.startsWith("audio/");
                            const bare = card.file_name.replace(/\.[^.]+$/, "");
                            const redundantTitle = audioFile && (!card.title || card.title === card.file_name || card.title === bare);
                            // An uploaded image sits on the canvas by itself: no card, title or details around it.
                            if (card.kind === "image" && card.image) return false;
                            return !(redundantTitle && !card.body && !card.tasks.length);
                          })() && <div className="board-card-content">
                            {card.kind !== "note" && !(card.kind === "file" && card.file_type.startsWith("audio/") && (!card.title || card.title === card.file_name || card.title === card.file_name.replace(/\.[^.]+$/, ""))) && <h3>
                              {card.title ||
                                `Untitled ${labels[card.kind].toLowerCase()}`}
                            </h3>}
                            {card.kind === "note" && card.body_html ? (
                              <div className="board-rich-body" dangerouslySetInnerHTML={{ __html: card.body_html }} />
                            ) : card.body ? (
                              <p>{card.body}</p>
                            ) : (
                              !card.tasks.length && card.kind !== "board" && card.kind !== "color" && (
                                <p className="board-card-hint">
                                  Double-click to add{" "}
                                  {card.kind === "scene"
                                    ? "action and editing notes"
                                    : card.kind === "note" ? "a note" : "details"}
                                  …
                                </p>
                              )
                            )}
                          </div>}
                          {card.caption && <p className="board-card-caption">{card.caption}</p>}
                          {card.url && !(card.kind === "image" && card.image) && (
                            <a
                              className="board-card-link"
                              href={card.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Link2 size={14} />
                              <span>{card.url}</span>
                              <ExternalLink size={13} />
                            </a>
                          )}
                          {card.tasks.map((task) => (
                            <label key={task.id} className="board-check">
                              <input
                                type="checkbox"
                                checked={task.done}
                                onChange={() =>
                                  updateCard({
                                    ...card,
                                    tasks: card.tasks.map((t) =>
                                      t.id === task.id
                                        ? { ...t, done: !t.done }
                                        : t,
                                    ),
                                  })
                                }
                              />
                              <span className={task.done ? "done" : ""}>
                                {task.text}
                              </span>
                            </label>
                          ))}
                          {card.kind === "scene" && (
                            <div className="board-scene-meta">
                              {card.duration && <span>{card.duration}</span>}
                              {card.dialogue && <p>“{card.dialogue}”</p>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {card.kind !== "line" && (card.tags.length > 0 || card.locked) && (
                      <div className="board-card-meta">
                        {card.locked && <span className="board-lock-badge" title="Locked in place"><Lock size={11} /></span>}
                        {card.tags.map((tag) => (
                          <button
                            key={tag}
                            className="board-tag"
                            aria-pressed={tagFilter.includes(tag)}
                            title={`Show only #${tag}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSearchOpen(true);
                              setTagFilter((list) => (list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag]));
                            }}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                    {view === "canvas" && card.kind !== "line" && !card.parent_id && !card.locked && (
                      <button
                        className="board-resize board-note-resize"
                        aria-label={`Resize ${card.title || labels[card.kind]}`}
                        onPointerDown={(e) => startDrag(e, card, true)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onKeyDown={(e) => {
                          const dx = e.key === "ArrowRight" ? 20 : e.key === "ArrowLeft" ? -20 : 0;
                          const dy = e.key === "ArrowDown" ? 20 : e.key === "ArrowUp" ? -20 : 0;
                          if (!dx && !dy) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const article = e.currentTarget.closest("article") as HTMLElement;
                          const actualHeight = card.height ?? article.getBoundingClientRect().height / zoom;
                          const frame = mediaFrame(article);
                          if (frame && !e.shiftKey) {
                            const width = Math.max(220, Math.min(2000, card.width + (dx || dy)));
                            updateCard({ ...card, width, height: Math.min(2000, width / frame.ratio + frame.chrome / zoom) });
                            return;
                          }
                          updateCard({
                            ...card,
                            width: Math.max(card.kind === "column" ? COLUMN_MIN_WIDTH : card.kind === "color" || card.kind === "group" ? 120 : card.kind === "shape" ? 40 : 220, Math.min(2000, card.width + (card.kind === "group" || card.kind === "column" ? dx || dy : dx))),
                            height: card.kind === "group"
                              ? null
                              : card.kind === "column"
                                ? card.height
                                : dy
                                ? Math.max(card.kind === "shape" ? 24 : 100, Math.min(2000, Math.max(card.kind === "shape" ? 24 : 100, actualHeight) + dy))
                                : card.height,
                          });
                        }}
                      >
                        ◢
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
          {view === "canvas" && board.cards.length > 0 && (
            <button
              className="board-minimap"
              aria-label="Board minimap. Click or drag to pan, arrow keys to move."
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                panFromMinimap(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) panFromMinimap(e);
              }}
              onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
              onKeyDown={(e) => {
                const el = viewport.current;
                const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                const dy = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
                if (!el || (!dx && !dy)) return;
                e.preventDefault();
                el.scrollBy({ left: dx * el.clientWidth * 0.25, top: dy * el.clientHeight * 0.25 });
              }}
            >
              <MapIcon size={12} />
              <span className="board-minimap-map" style={{ width: width * miniScale, height: height * miniScale }}>
                {board.cards.filter((card) => card.kind !== "line").map((card) => <i key={card.id} style={{ left: card.x * miniScale, top: card.y * miniScale, width: Math.max(2, card.width * miniScale), height: Math.max(2, cardHeight(card, viewport.current) * miniScale) }} />)}
                <b style={{ left: (viewportScroll.left / zoom) * miniScale, top: (viewportScroll.top / zoom) * miniScale, width: ((viewport.current?.clientWidth || 0) / zoom) * miniScale, height: ((viewport.current?.clientHeight || 0) / zoom) * miniScale }} />
              </span>
            </button>
          )}
        </div>
          {view === "canvas" && anchor && (selection.size > 1 || activeCard) && (
            <aside className={`board-float ${anchor.up ? "is-up" : ""}`} aria-label="Card options" style={{ left: anchor.left, top: anchor.top, ["--float-room" as string]: `${anchor.room}px` }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              <div className="board-float-bar" role="toolbar" aria-label={selection.size > 1 ? "Selection options" : activeCard?.kind === "line" ? "Line style" : `${labels[activeCard!.kind]} options`}>
                {selection.size > 1 ? <strong>{selection.size} selected</strong> : activeCard && (() => {
                  const Icon = icons[activeCard.kind];
                  return <strong><Icon size={14} />{labels[activeCard.kind]}</strong>;
                })()}
                {activeCard && activeCard.kind === "line" && (
                  <div className="board-float-colors">
                    {LINE_COLORS.map((color) => (
                      <button key={color} aria-label={`Line color ${color}`} title={color} style={{ background: color }}
                        aria-pressed={activeCard.line_color === color} onClick={() => updateCard({ ...activeCard, line_color: color })} />
                    ))}
                  </div>
                )}
                {activeCard && activeCard.kind === "line" && (
                  <div className="board-float-colors board-float-label">
                    <label className="board-mini-color" title="Label text color">
                      <span className="board-mini-color-text" style={{ color: activeCard.label_color ?? undefined }}>A</span>
                      <input type="color" aria-label="Label text color" value={activeCard.label_color ?? "#1d1d1b"}
                        onChange={(e) => updateCard({ ...activeCard, label_color: e.target.value })} />
                    </label>
                    <label className="board-mini-color" title="Label box color">
                      <span className="board-mini-color-box" style={{ background: activeCard.label_background ?? undefined }} />
                      <input type="color" aria-label="Label box color" value={activeCard.label_background ?? "#ffffff"}
                        onChange={(e) => updateCard({ ...activeCard, label_background: e.target.value })} />
                    </label>
                    {(activeCard.label_color || activeCard.label_background) && (
                      <button aria-label="Reset label colors" title="Reset label colors" className="board-mini-reset"
                        onClick={() => updateCard({ ...activeCard, label_color: null, label_background: null })}><RotateCcw size={12} /></button>
                    )}
                  </div>
                )}
                {activeCard && activeCard.kind === "color" && (
                  <div className="board-float-colors board-float-swatch">
                    <input type="color" aria-label="Swatch color" value={activeCard.color_value} onChange={(e) => updateCard({ ...activeCard, color_value: e.target.value })} />
                    <HexField value={activeCard.color_value} onChange={(color_value) => updateCard({ ...activeCard, color_value })} />
                  </div>
                )}
                {activeCard && activeCard.kind === "group" && (() => {
                  const sizes = ["xlarge", "large", "normal", "small"] as const;
                  const fontIds = Object.keys(HEADING_FONTS) as (keyof typeof HEADING_FONTS)[];
                  const aligns = ["left", "center", "right"] as const;
                  const AlignIcon = { left: AlignLeft, center: AlignCenter, right: AlignRight }[activeCard.heading_align];
                  const sample = activeCard.title.trim().split("\n")[0].slice(0, 28) || "Heading";
                  const preview = (patch: Partial<BoardCard>) => {
                    if (patch.heading_font) {
                      const face = HEADING_FONTS[patch.heading_font];
                      void document.fonts.load(`${face.weight} 20px ${face.family}`).catch(() => []);
                    }
                    setHeadingPreview({ id: activeCard.id, patch });
                  };
                  const apply = (patch: Partial<BoardCard>) => {
                    const commit = () => { setHeadingPreview(null); updateCard(fitHeading(activeCard, { ...activeCard, ...patch })); };
                    if (patch.heading_font) {
                      const face = HEADING_FONTS[patch.heading_font];
                      void document.fonts.load(`${face.weight} 20px ${face.family}`).catch(() => []).then(commit);
                    } else commit();
                  };
                  // Open beside the toolbar, toward the roomier side, so the card stays visible for the live preview.
                  const sideLeft = (anchor?.left ?? 0) > (workspace.current?.clientWidth ?? 1000) / 2;
                  return (
                    <div className="board-float-colors board-float-heading">
                      <button className="board-style-trigger" aria-haspopup="dialog" aria-expanded={styleOpen}
                        title="Heading style and font" onClick={() => setStyleOpen((open) => !open)}>
                        <span>{HEADING_SIZE_LABELS[activeCard.heading_size]}</span>
                        <i aria-hidden="true">·</i>
                        <span style={{ fontFamily: HEADING_FONTS[activeCard.heading_font].family }}>{HEADING_FONTS[activeCard.heading_font].label}</span>
                        <ChevronDown size={12} aria-hidden="true" />
                      </button>
                      <button className="board-float-segment is-icon" aria-label={`Align ${activeCard.heading_align}. Click to change.`}
                        title={`Align ${activeCard.heading_align}`}
                        onClick={() => updateCard({ ...activeCard, heading_align: aligns[(aligns.indexOf(activeCard.heading_align) + 1) % 3] })}>
                        <AlignIcon size={14} />
                      </button>
                      {styleOpen && (
                        <div className={`board-style-popover ${sideLeft ? "is-left" : "is-right"}`} role="dialog" aria-label="Heading style"
                          onPointerLeave={() => setHeadingPreview(null)}>
                          <h4>Style</h4>
                          {sizes.map((size) => (
                            <button key={size} className="board-style-row" aria-pressed={activeCard.heading_size === size}
                              onPointerEnter={() => preview({ heading_size: size })} onFocus={() => preview({ heading_size: size })}
                              onClick={() => apply({ heading_size: size })}>
                              <span>{HEADING_SIZE_LABELS[size]}</span>
                              <small>{HEADING_SIZE_PX[size]}px</small>
                            </button>
                          ))}
                          <h4>Font</h4>
                          {fontIds.map((id) => (
                            <button key={id} className="board-style-row is-font" aria-pressed={activeCard.heading_font === id}
                              style={{ fontFamily: HEADING_FONTS[id].family, fontWeight: HEADING_FONTS[id].weight }}
                              onPointerEnter={() => preview({ heading_font: id })} onFocus={() => preview({ heading_font: id })}
                              onClick={() => apply({ heading_font: id })}>
                              <span>{sample}</span>
                              <small style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}>{HEADING_FONTS[id].label}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {activeCard && activeCard.kind === "shape" && (
                  <ShapeToolbar card={activeCard} side={(anchor?.left ?? 0) > (workspace.current?.clientWidth ?? 1000) / 2 ? "left" : "right"}
                    onChange={(patch) => updateCard({ ...activeCard, ...patch })} />
                )}
                {activeCard && activeCard.kind !== "line" && activeCard.kind !== "group" && activeCard.kind !== "color" && activeCard.kind !== "shape" && (
                  <div className="board-float-colors">
                    <button aria-label="Default card background" title="Default" aria-pressed={!activeCard.background_color}
                      className="board-swatch-default" onClick={() => updateCard({ ...activeCard, background_color: null })} />
                    {Object.entries(NOTE_COLORS).map(([name, color]) => (
                      <button key={name} aria-label={`${name} card background`} title={name} style={{ background: color }}
                        aria-pressed={activeCard.background_color === color} onClick={() => updateCard({ ...activeCard, background_color: color })} />
                    ))}
                  </div>
                )}
                <span className="board-float-actions">
                  {activeCard && !["line", "group", "column", "board", "color"].includes(activeCard.kind) && (
                    <button aria-label="Edit content" title="Edit content" onClick={() => beginEditing(activeCard)}><Pencil size={15} /></button>
                  )}
                  {activeCard && activeCard.kind !== "line" && (
                    <button
                      aria-label={activeCard.locked ? "Unlock position" : "Lock position"}
                      title={activeCard.locked ? "Unlock position" : "Lock position"}
                      aria-pressed={activeCard.locked}
                      onClick={() => updateCard({ ...activeCard, locked: !activeCard.locked })}
                    >
                      {activeCard.locked ? <Lock size={15} /> : <Unlock size={15} />}
                    </button>
                  )}
                  {activeCard && !["line", "group", "column"].includes(activeCard.kind) && (
                    <button
                      aria-label={activeCard.collapsed ? "Expand card" : "Collapse card"}
                      title={activeCard.collapsed ? "Expand card" : "Collapse to title"}
                      aria-pressed={activeCard.collapsed}
                      onClick={() => updateCard({ ...activeCard, collapsed: !activeCard.collapsed })}
                    >
                      {activeCard.collapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
                    </button>
                  )}
                  <button aria-label="Duplicate" title="Duplicate" onClick={() => selection.size > 1 ? placeMany(selectionWith()) : activeCard && duplicate(activeCard)}><CopyPlus size={15} /></button>
                  <button className="is-danger" aria-label="Delete" title="Delete" onClick={() => trashMany(selection.size > 1 ? [...selection] : [activeCard!.id])}><Trash2 size={15} /></button>
                  <button aria-label="More options" title="More options" aria-expanded={moreOpen} aria-pressed={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={16} /></button>
                </span>
              </div>
              {moreOpen && <div className="board-inspector">
              {selection.size > 1 ? (
                <div role="group" aria-label="Arrange selection">
                  <section>
                    <h4>Arrange</h4>
                    <div className="board-inspector-grid">
                      {([
                        ["left", "Align left", AlignStartVertical],
                        ["center", "Align centers horizontally", AlignCenterVertical],
                        ["right", "Align right", AlignEndVertical],
                        ["top", "Align top", AlignStartHorizontal],
                        ["middle", "Align middles", AlignCenterHorizontal],
                        ["bottom", "Align bottom", AlignEndHorizontal],
                        ["distribute-x", "Distribute horizontally", AlignHorizontalDistributeCenter],
                        ["distribute-y", "Distribute vertically", AlignVerticalDistributeCenter],
                      ] as const).map(([mode, label, Icon]) => (
                        <button key={mode} aria-label={label} title={label}
                          disabled={selectedCards.filter((card) => !card.parent_id).length < (mode.startsWith("distribute") ? 3 : 2)}
                          onClick={() => align(mode)}>
                          <Icon size={16} />
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              ) : activeCard ? (
                <div role="group" aria-label={`${activeCard.kind === "line" ? "Line" : labels[activeCard.kind]} details`}>
                  {activeCard.kind === "line" ? (
                    <>
                      <section>
                        <h4>Label</h4>
                        <input aria-label="Line label" maxLength={200} placeholder="Add a label…" value={activeCard.title}
                          onFocus={rememberEdit} onChange={(e) => inlineChange(activeCard.id, { title: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }} />
                      </section>
                      <section>
                        <h4>Weight</h4>
                        <select aria-label="Line weight" value={activeCard.line_weight} onChange={(e) => updateCard({ ...activeCard, line_weight: Number(e.target.value) })}>
                          {[1, 2, 3, 4, 6, 8].map((weight) => <option key={weight} value={weight}>{weight}px</option>)}
                        </select>
                      </section>
                      <section>
                        <h4>Style</h4>
                        <div className="board-inspector-toggles">
                          <button aria-pressed={!activeCard.line_dashed} onClick={() => updateCard({ ...activeCard, line_dashed: false })}>Solid</button>
                          <button aria-pressed={activeCard.line_dashed} onClick={() => updateCard({ ...activeCard, line_dashed: true })}>Dashed</button>
                        </div>
                      </section>
                      <section>
                        <h4>Arrows</h4>
                        <div className="board-inspector-toggles">
                          <button aria-pressed={activeCard.line_start_arrow} onClick={() => updateCard({ ...activeCard, line_start_arrow: !activeCard.line_start_arrow })}>Start arrow</button>
                          <button aria-pressed={activeCard.line_end_arrow} onClick={() => updateCard({ ...activeCard, line_end_arrow: !activeCard.line_end_arrow })}>End arrow</button>
                        </div>
                        <div className="board-inspector-toggles">
                          {(["triangle", "open", "dot", "bar"] as const).map((style) => (
                            <button key={style} aria-pressed={activeCard.line_arrow_style === style}
                              onClick={() => updateCard({ ...activeCard, line_arrow_style: style, line_end_arrow: activeCard.line_start_arrow || activeCard.line_end_arrow ? activeCard.line_end_arrow : true })}>
                              {{ triangle: "Filled", open: "Open", dot: "Dot", bar: "Bar" }[style]}
                            </button>
                          ))}
                        </div>
                      </section>
                      <section>
                        <h4>Route</h4>
                        <div className="board-inspector-toggles">
                          <button aria-pressed={activeCard.line_routing === "straight"}
                            onClick={() => updateCard({ ...activeCard, line_routing: "straight", line_shift: null, line_bend: null })}>Straight / curved</button>
                          <button aria-pressed={activeCard.line_routing === "elbow"}
                            onClick={() => updateCard({ ...activeCard, line_routing: "elbow", line_shift: null, line_bend: null })}>Elbow</button>
                        </div>
                      </section>
                      <section>
                        <h4>Look</h4>
                        <div className="board-inspector-toggles">
                          <button aria-pressed={!activeCard.sketchy} onClick={() => updateCard({ ...activeCard, sketchy: false })}>Clean</button>
                          <button aria-pressed={activeCard.sketchy} onClick={() => updateCard({ ...activeCard, sketchy: true, shape_seed: activeCard.sketchy ? activeCard.shape_seed : 1 + Math.floor(Math.random() * 99000) })}>Hand-drawn</button>
                        </div>
                      </section>
                      {!!(activeCard.line_bend || activeCard.line_shift) && (
                        <section><button className="board-inspector-wide" onClick={() => straightenLine(activeCard)}>Straighten line</button></section>
                      )}
                    </>
                  ) : (
                    <>
                      {activeCard.kind !== "note" && (
                        <section>
                          <h4>{activeCard.kind === "group" ? "Heading" : "Name"}</h4>
                          <input aria-label="Card title" maxLength={200} value={activeCard.title}
                            placeholder={activeCard.kind === "group" ? "Heading" : `Name this ${labels[activeCard.kind].toLowerCase()}`}
                            onFocus={rememberEdit}
                            onChange={(e) => inlineChange(activeCard.id, { title: e.target.value })}
                            onBlur={(e) => {
                              if (activeCard.kind === "board" && activeCard.target_board_id && e.target.value.trim())
                                void renameLinkedBoard(activeCard.target_board_id, e.target.value.trim());
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }} />
                        </section>
                      )}
                      <section>
                        <h4>Tags</h4>
                        <div className="board-tag-editor">
                          {activeCard.tags.map((tag) => (
                            <span key={tag} className="board-tag board-tag-chip">
                              #{tag}
                              <button aria-label={`Remove tag ${tag}`} onClick={() => updateCard({ ...activeCard, tags: activeCard.tags.filter((item) => item !== tag) })}>×</button>
                            </span>
                          ))}
                        </div>
                        <input
                          aria-label="Add tag"
                          list="board-tag-options"
                          maxLength={30}
                          placeholder={activeCard.tags.length >= 12 ? "Tag limit reached" : "Add a tag…"}
                          disabled={activeCard.tags.length >= 12}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== ",") return;
                            e.preventDefault();
                            const tag = e.currentTarget.value.trim().replace(/^#/, "").replace(/\s+/g, "-");
                            if (tag && !activeCard.tags.includes(tag)) updateCard({ ...activeCard, tags: [...activeCard.tags, tag] });
                            e.currentTarget.value = "";
                          }}
                        />
                        <datalist id="board-tag-options">
                          {allTags.filter((tag) => !activeCard.tags.includes(tag)).map((tag) => <option key={tag} value={tag} />)}
                        </datalist>
                      </section>
                      {activeCard.kind === "color" ? (
                        <section>
                          <h4>Swatch</h4>
                          <input type="color" aria-label="Swatch color" value={activeCard.color_value} onChange={(e) => updateCard({ ...activeCard, color_value: e.target.value })} />
                        </section>
                      ) : null}
                      {activeCard.kind === "group" && (
                        <section>
                          <h4>Size & alignment</h4>
                          <div className="board-inspector-toggles">
                            {(["xlarge", "large", "normal", "small"] as const).map((size) => (
                              <button key={size} aria-pressed={activeCard.heading_size === size} onClick={() => updateCard(fitHeading(activeCard, { ...activeCard, heading_size: size }))}>{HEADING_SIZE_LABELS[size]}</button>
                            ))}
                          </div>
                          <div className="board-inspector-toggles">
                            {(Object.keys(HEADING_FONTS) as (keyof typeof HEADING_FONTS)[]).map((id) => (
                              <button key={id} aria-pressed={activeCard.heading_font === id} style={{ fontFamily: HEADING_FONTS[id].family }}
                                onClick={() => updateCard(fitHeading(activeCard, { ...activeCard, heading_font: id }))}>{HEADING_FONTS[id].label}</button>
                            ))}
                          </div>
                          <div className="board-inspector-toggles">
                            {(["left", "center", "right"] as const).map((side) => <button key={side} aria-label={`Align heading ${side}`} aria-pressed={activeCard.heading_align === side} onClick={() => updateCard({ ...activeCard, heading_align: side })}>{side[0].toUpperCase() + side.slice(1)}</button>)}
                          </div>
                        </section>
                      )}
                      {activeCard.kind === "link" && (
                        <section>
                          <h4>Show</h4>
                          <div className="board-inspector-toggles">
                            <button aria-pressed={activeCard.link_show_image} onClick={() => updateCard({ ...activeCard, link_show_image: !activeCard.link_show_image })}>Preview image</button>
                            <button aria-pressed={activeCard.link_show_description} onClick={() => updateCard({ ...activeCard, link_show_description: !activeCard.link_show_description })}>Description</button>
                          </div>
                          <div className="board-inspector-toggles">
                            <button onClick={() => beginEditing(activeCard)}>Edit link</button>
                            <button disabled={!activeCard.url} onClick={() => {
                              requestedPreviews.current.delete(`${activeCard.id}|${activeCard.url}`);
                              updateCard({ ...activeCard, link_preview: null });
                              setPreviewVersion((version) => version + 1);
                            }}>Refresh preview</button>
                          </div>
                          {activeCard.url && <a className="board-inspector-wide" href={activeCard.url} target="_blank" rel="noopener noreferrer" draggable={false}>Open link <ExternalLink size={12} /></a>}
                        </section>
                      )}
                      {(activeCard.kind === "video_link" || activeCard.kind === "audio_link") && (
                        <section>
                          <h4>{activeCard.kind === "video_link" ? "Video" : "Audio"}</h4>
                          <div className="board-inspector-toggles">
                            <button onClick={() => beginEditing(activeCard)}>Edit link</button>
                          </div>
                          {activeCard.url && <a className="board-inspector-wide" href={activeCard.url} target="_blank" rel="noopener noreferrer" draggable={false}>Open original <ExternalLink size={12} /></a>}
                        </section>
                      )}
                      {activeCard.kind === "checklist" && (
                        <section>
                          <h4>List</h4>
                          <button className="board-inspector-wide" aria-pressed={activeCard.hide_done} onClick={() => updateCard({ ...activeCard, hide_done: !activeCard.hide_done })}>
                            {activeCard.hide_done ? "Show completed" : "Hide completed"}
                          </button>
                          <button className="board-inspector-wide" disabled={!activeCard.tasks.some((task) => task.done)} onClick={() => updateCard({ ...activeCard, tasks: activeCard.tasks.filter((task) => !task.done) })}>Clear completed</button>
                        </section>
                      )}
                      {activeCard.kind === "board" && activeCard.target_board_id && (
                        <section><button className="board-inspector-wide" onClick={() => void openBoard(activeCard.target_board_id!)}>Open board</button></section>
                      )}
                    </>
                  )}
                  <section className="board-inspector-actions">
                    <button onClick={() => change(layerCard(current.current, activeCard.id, true))}>Bring to front</button>
                    <button onClick={() => change(layerCard(current.current, activeCard.id, false))}>Send to back</button>
                  </section>
                </div>
              ) : null}
              </div>}
            </aside>
          )}
      </div>
      {!board.cards.length && !focusMode && (
        <div className="board-help">
          <span>Drag tools or files onto the canvas, press N for a note, or paste a link or image.</span>
          <button onClick={() => setShortcutsOpen(true)}>
            <Keyboard size={13} />
            Keyboard shortcuts
          </button>
        </div>
      )}
      {menu && (
        <BoardContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          actions={(() => {
            const card = current.current.cards.find((c) => c.id === menu.id);
            if (menu.page === "strip" || menu.page === "card-background") {
              if (!card) return [];
              const strip = menu.page === "strip";
              return [
                {
                  label: "Back",
                  keepOpen: true,
                  run: () => setMenu({ ...menu, page: undefined }),
                },
                {
                  label: strip
                    ? "Default top strip"
                    : "Default card background",
                  run: () =>
                    updateCard({
                      ...card,
                      [strip ? "strip_color" : "background_color"]: null,
                    }),
                },
                ...Object.entries(strip ? STRIP_COLORS : NOTE_COLORS).map(
                  ([label, color]) => ({
                    label: `${label} ${strip ? "top strip" : "card background"}`,
                    color,
                    run: () =>
                      updateCard({
                        ...card,
                        [strip ? "strip_color" : "background_color"]: color,
                      }),
                  }),
                ),
              ];
            }
            if (menu.page === "move") {
              const others = boardChoices.filter((item) => item.id !== board.id);
              const ids = selectionWith(card ?? undefined).map((item) => item.id);
              return [
                { label: "Back", keepOpen: true, run: () => setMenu({ ...menu, page: undefined }) },
                ...(others.length
                  ? others.map((item) => ({
                      label: item.title,
                      run: () => void moveToBoard(ids, item.id, item.title),
                    }))
                  : [{ label: "No other boards yet", disabled: true, run: () => {} }]),
              ];
            }
            if (menu.page === "add")
              return [
                { label: "Back", keepOpen: true, run: () => setMenu({ ...menu, page: undefined }) },
                ...(TOOL_GROUPS.flatMap((group) => group.kinds)).map((kind) => ({
                  label: `New ${labels[kind].toLowerCase()}`,
                  shortcut: TOOL_KEYS[kind],
                  run: () => add(kind, menu.point),
                })),
              ];
            if (card) {
              const group = selectionWith(card);
              const single = group.length === 1;
              const divider = { label: "", separator: true, run: () => {} };
              const asset = card.image ? boardAssetUrl(card.image) : "";
              // Open or save an uploaded file. Demo files are data: URLs, which
              // browsers refuse to open directly, so those go through a blob.
              const openAsset = async (download: boolean) => {
                try {
                  const href = asset.startsWith("data:")
                    ? URL.createObjectURL(await (await fetch(asset)).blob())
                    : asset;
                  if (download) {
                    const link = document.createElement("a");
                    link.href = href;
                    link.download = card.file_name || card.title || "download";
                    link.click();
                  } else window.open(href, "_blank", "noopener");
                } catch {
                  setError("Couldn't open that file.");
                }
              };
              const own: { label: string; run: () => void }[] = [];
              if (single) {
                if (card.url && ["link", "video_link", "audio_link"].includes(card.kind)) {
                  own.push(
                    { label: card.kind === "link" ? "Open link" : "Open original", run: () => { window.open(card.url, "_blank", "noopener,noreferrer"); } },
                    { label: "Copy link", run: () => { void navigator.clipboard?.writeText(card.url).then(() => setNotice("Link copied.")); } },
                  );
                }
                if (card.kind === "board" && card.target_board_id) {
                  const target = card.target_board_id;
                  own.push({ label: "Open board", run: () => void openBoard(target) });
                }
                if (asset && ["image", "scene", "file", "video"].includes(card.kind)) {
                  own.push(
                    { label: card.kind === "image" || card.kind === "scene" ? "Open full size" : "Open file", run: () => void openAsset(false) },
                    { label: "Download", run: () => void openAsset(true) },
                  );
                }
                if (!["line", "column", "board", "color"].includes(card.kind))
                  own.push({ label: card.kind === "group" ? "Edit heading" : "Edit", run: () => beginEditing(card) });
              }
              return [
                ...(own.length ? [...own, divider] : []),
                { label: "Cut", shortcut: "⌘/Ctrl X", run: () => { void copyCards(group, true); } },
                { label: "Copy", shortcut: "⌘/Ctrl C", run: () => { void copyCards(group); } },
                { label: "Paste", shortcut: "⌘/Ctrl V", run: () => { void pasteClipboard(visiblePoint()); } },
                divider,
                { label: "Duplicate", run: () => duplicate(card) },
                ...(card.kind === "line"
                  ? []
                  : [{
                      label: card.locked ? "Unlock position" : "Lock position",
                      run: () => {
                        const next = !card.locked;
                        change({
                          ...current.current,
                          cards: current.current.cards.map((item) =>
                            group.some((member) => member.id === item.id) && item.kind !== "line"
                              ? { ...item, locked: next }
                              : item),
                        });
                      },
                    }]),
                ...(single && !["line", "group", "column"].includes(card.kind)
                  ? [{
                      label: card.collapsed ? "Expand" : "Collapse to title",
                      run: () => updateCard({ ...card, collapsed: !card.collapsed }),
                    }]
                  : []),
                { label: "Move to board…", keepOpen: true, run: () => setMenu({ ...menu, page: "move" }) },
                { label: "Bring to front", run: () => change(layerCard(current.current, card.id, true)) },
                { label: "Send to back", run: () => change(layerCard(current.current, card.id, false)) },
                divider,
                { label: "Change top strip", keepOpen: true, run: () => setMenu({ ...menu, page: "strip" }) },
                { label: "Change card background", keepOpen: true, run: () => setMenu({ ...menu, page: "card-background" }) },
                divider,
                {
                  label: group.length > 1 ? `Move ${group.length} to trash` : "Move to trash",
                  danger: true,
                  run: () => trashMany(group.map((item) => item.id)),
                },
                { label: card.created_by_name || "Creator not recorded", info: "Created by", run: () => {} },
              ];
            }
            const divider = { label: "", separator: true, run: () => {} };
            return [
              { label: "Paste here", shortcut: "⌘/Ctrl V", run: () => { void pasteClipboard(menu.point); } },
              { label: "New note here", shortcut: "N", run: () => add("note", menu.point) },
              { label: "Add…", keepOpen: true, run: () => setMenu({ ...menu, page: "add" }) },
              divider,
              { label: "Undo", shortcut: "⌘/Ctrl Z", disabled: !undo.current.length, run: () => history(true) },
              { label: "Select all", shortcut: "⌘/Ctrl A", disabled: !current.current.cards.length, run: selectAll },
              divider,
              { label: "Fit board", disabled: !current.current.cards.length, run: fitBoard },
              { label: "Zoom to 100%", run: () => zoomAt(1) },
              { label: "Background, grid and rulers…", run: () => setCanvasPanel(true) },
              divider,
              { label: "Export…", run: () => setExportOpen(true) },
            ];
          })()}
        />
      )}
      {shortcutsOpen && (
        <Modal
          title="Keyboard shortcuts"
          description="Shortcuts work when you are not typing in a card."
          onClose={() => setShortcutsOpen(false)}
        >
          <dl className="board-shortcuts">
            {[
              ["N", "New note"], ["H", "New heading"], ["T", "New to-do list"], ["I", "New image"],
              ["V", "New video link"], ["A", "New audio link"], ["L", "New link"],
              ["C", "New column"], ["B", "New board"], ["-", "New line"], ["P", "New color swatch"],
              ["Double-click", "New note on empty canvas"],
              ["Enter", "Edit selected card"], ["⌘/Ctrl Enter", "Add a card beside the selection"],
              ["⌘/Ctrl D", "Duplicate selection"], ["⌘/Ctrl C · X · V", "Copy, cut, paste"],
              ["Delete", "Move selection to trash"], ["Arrow keys", "Nudge (Shift for 10px)"],
              ["⌘/Ctrl A", "Select all"], ["Esc", "Clear selection"], ["⌘/Ctrl Z", "Undo (Shift to redo)"],
              ["⌘/Ctrl F or /", "Search this board"], ["F", "Focus mode (hide toolbars)"], ["Space + drag", "Pan the canvas"], ["⌘/Ctrl scroll", "Zoom"], ["?", "Show this list"],
            ].map(([keys, action]) => (
              <div key={keys}>
                <dt><kbd>{keys}</kbd></dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
      {trashOpen && (
        <Modal
          title="Board trash"
          description="Restore a card or permanently remove it from this board."
          onClose={() => { setTrashOpen(false); setEmptyCards(false); }}
        >
          {board.trash.length > 0 && (
            <div className="board-trash-bar">
              <span>{board.trash.length} {board.trash.length === 1 ? "item" : "items"} in trash</span>
              {emptyCards ? (
                <span className="board-trash-confirm">
                  <span>Delete {board.trash.length === 1 ? "it" : `all ${board.trash.length}`} forever?</span>
                  <Button onClick={() => setEmptyCards(false)}>Cancel</Button>
                  <Button variant="danger" onClick={() => { change({ ...current.current, trash: [] }); setEmptyCards(false); }}>
                    Delete forever
                  </Button>
                </span>
              ) : (
                <Button variant="danger" onClick={() => setEmptyCards(true)}>
                  <Trash2 size={14} />
                  Empty trash
                </Button>
              )}
            </div>
          )}
          <div className="board-trash-list board-trash-grid">
            {!board.trash.length ? (
              <p>Trash is empty.</p>
            ) : (
              board.trash.map((card) => (
                <div key={card.id} className="trash-card">
                  <TrashCardPreview card={card} />
                  <span className="trash-card-title"><b>{labels[card.kind]}</b>{card.kind !== "group" && card.title ? ` · ${card.title}` : ""}</span>
                  <Button
                    onClick={() =>
                      change(restoreCard(current.current, card.id))
                    }
                  >
                    Restore
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      change({
                        ...current.current,
                        trash: current.current.trash.filter(
                          (c) => c.id !== card.id,
                        ),
                      })
                    }
                  >
                    Delete forever
                  </Button>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
      {boardMenu && (
        <BoardContextMenu
          x={boardMenu.x}
          y={boardMenu.y}
          label="Board menu"
          onClose={() => setBoardMenu(null)}
          actions={[
            { label: "Rename board", run: () => { setTitleDraft(board.title); setEditingTitle(true); } },
            { label: "Background, grid and rulers…", run: () => setCanvasPanel(true) },
            { label: "Export…", run: () => setExportOpen(true) },
            { label: "Keyboard shortcuts", shortcut: "?", run: () => setShortcutsOpen(true) },
            { label: "", separator: true, run: () => {} },
            { label: "Move to trash", danger: true, run: () => setRemove(true) },
          ]}
        />
      )}
      {exportOpen && (
        <ExportDialog
          board={current.current}
          selectionIds={[...selection]}
          assetUrl={boardAssetUrl}
          captureRoot={() => (view === "canvas" ? viewport.current?.querySelector<HTMLElement>(".board-canvas") ?? null : null)}
          onClose={() => setExportOpen(false)}
        />
      )}
      {remove && (
        <Modal
          title="Move this board to trash?"
          description={`You can restore it from Trash on the boards page for ${TRASH_DAYS} days.`}
          onClose={() => !busy && setRemove(false)}
        >
          <div className="board-dialog-actions">
            <Button onClick={() => setRemove(false)}>Keep board</Button>
            <Button variant="danger" disabled={busy} onClick={deleteBoard}>
              {busy ? "Moving…" : "Move to trash"}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function InlineField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  let linked = false;
  const content = Children.map(children, (child) => {
    if (
      !linked &&
      isValidElement<{ id?: string }>(child) &&
      typeof child.type === "string" &&
      ["input", "textarea", "select"].includes(child.type)
    ) {
      linked = true;
      return cloneElement(child, { id });
    }
    return child;
  });
  return (
    <div className="field">
      {linked ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {content}
    </div>
  );
}

function LiveNoteEditor({
  body,
  html,
  onChange,
  onClose,
}: {
  body: string;
  html: string;
  onChange: (body: string, html: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");
  const [format, setFormat] = useState({ bold: false, italic: false, underline: false, size: "normal", ul: false, ol: false, quote: false });
  // Keep the toolbar showing what the caret is in, so Bold, sizes and lists read as on/off.
  useEffect(() => {
    const update = () => {
      const root = ref.current;
      const selection = window.getSelection();
      if (!root || !selection?.anchorNode || !root.contains(selection.anchorNode)) return;
      const node = selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentElement : (selection.anchorNode as HTMLElement);
      const inside = (selector: string) => !!node?.closest(selector) && root.contains(node.closest(selector));
      setFormat({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        size: inside("h2") ? "title" : inside("h3") ? "large" : inside("h6") ? "small" : "normal",
        ul: inside("ul"),
        ol: inside("ol"),
        quote: inside("blockquote"),
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (html) element.innerHTML = html;
    else element.textContent = body;
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);
  function command(name: string, value?: string) {
    ref.current?.focus();
    document.execCommand(name, false, value);
    const element = ref.current;
    if (element)
      onChange(element.innerText.replace(/\n$/, "").slice(0, 20000), sanitizeBoardRichText(element.innerHTML));
  }
  // A block style (size or quote) switches on, and pressing it again returns the text to normal.
  function setBlock(tag: "p" | "h2" | "h3" | "h6" | "blockquote", active: boolean) {
    command("formatBlock", active ? "p" : tag);
  }
  return (
    <div className="board-rich-editor">
      <div className="board-rich-toolbar" role="toolbar" aria-label="Text formatting" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" aria-label="Bold" aria-pressed={format.bold} onClick={() => command("bold")}><Bold size={14} /></button>
        <button type="button" aria-label="Italic" aria-pressed={format.italic} onClick={() => command("italic")}><Italic size={14} /></button>
        <button type="button" aria-label="Underline" aria-pressed={format.underline} onClick={() => command("underline")}><Underline size={14} /></button>
        <span className="board-rich-sizes" role="group" aria-label="Text size">
          {([["small", "Small text", "h6", 9], ["normal", "Normal text", "p", 12], ["large", "Large text", "h3", 15], ["title", "Title text", "h2", 18]] as const).map(([id, label, tag, px]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={format.ul || format.ol ? "Sizes apply to paragraphs, not list items" : label}
              aria-pressed={format.size === id}
              disabled={format.ul || format.ol}
              onClick={() => (id === "normal" ? command("formatBlock", "p") : setBlock(tag, format.size === id))}
            >
              <span style={{ fontSize: px, fontWeight: 700, lineHeight: 1 }}>A</span>
            </button>
          ))}
        </span>
        <button type="button" aria-label="Bulleted list" aria-pressed={format.ul} onClick={() => command("insertUnorderedList")}><List size={14} /></button>
        <button type="button" aria-label="Numbered list" aria-pressed={format.ol} onClick={() => command("insertOrderedList")}><ListOrdered size={14} /></button>
        <button type="button" aria-label="Quote" aria-pressed={format.quote} onClick={() => setBlock("blockquote", format.quote)}><Quote size={14} /></button>
        <button type="button" aria-label="Add link" onClick={() => { savedRange.current = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null; setLinking(true); }}><Link2 size={14} /></button>
      </div>
      {linking && <form className="board-rich-link" onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\//i.test(link)) { const selection = window.getSelection(); if (savedRange.current && selection) { selection.removeAllRanges(); selection.addRange(savedRange.current); } command("createLink", link); setLink(""); setLinking(false); } }}>
        <input autoFocus type="url" aria-label="Link URL" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
        <button type="submit">Apply</button>
      </form>}
      <div
      ref={ref}
      className="board-live-note"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Notes"
      aria-multiline="true"
      data-placeholder="Write a note…"
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/\n$/, "").slice(0, 20000), sanitizeBoardRichText(e.currentTarget.innerHTML))}
      onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) onClose(); }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          const selection = window.getSelection();
          const block = selection?.anchorNode instanceof HTMLElement
            ? selection.anchorNode
            : selection?.anchorNode?.parentElement;
          const text = block?.textContent || "";
          const shortcuts: Record<string, [string, string?]> = {
            "#": ["formatBlock", "h2"],
            "##": ["formatBlock", "h3"],
            "-": ["insertUnorderedList"],
            "*": ["insertUnorderedList"],
            "1.": ["insertOrderedList"],
            ">": ["formatBlock", "blockquote"],
          };
          const shortcut = shortcuts[text.trim()];
          if (shortcut && block) {
            e.preventDefault();
            block.textContent = "";
            command(shortcut[0], shortcut[1]);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.blur();
        }
      }}
      />
    </div>
  );
}

function InlineCardEditor({
  card,
  demo,
  boardChoices,
  onClose,
  onChange,
}: {
  card: BoardCard;
  demo: boolean;
  boardChoices: Summary[];
  onClose: () => void;
  onChange: (patch: Partial<BoardCard>) => void;
}) {
  const draft = card;
  const [url, setUrl] = useState(card.url);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [library, setLibrary] = useState(false);
  // Reuse an image already in the account instead of uploading it again.
  function useLibraryImage(item: { path: string; size: number }) {
    const header = item.path.startsWith("data:") ? /^data:([^;]+);/.exec(item.path)?.[1] : "";
    const ext = item.path.split(".").pop()?.toLowerCase() ?? "";
    const type = header || ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[ext] || "image/png";
    patch({ image: item.path, file_name: "", file_type: type, file_size: item.size });
    setLibrary(false);
  }
  // Link cards open as just a URL field; dragging the card taller reveals the description.
  const expanded = card.height != null && card.height > (EXPAND_HEIGHT[card.kind] ?? Infinity);
  function patch(value: Partial<BoardCard>) {
    onChange(value);
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const wantsImage = card.kind === "image" || card.kind === "scene" || card.kind === "link";
      const prepared = wantsImage ? (await prepareUpload(file, demo)).file : file;
      setUploadProgress(0);
      const image = wantsImage
        ? await uploadBoardImage(prepared, demo, setUploadProgress)
        : await uploadBoardAsset(prepared, demo, setUploadProgress);
      patch({ image, file_name: prepared.name, file_type: prepared.type, file_size: prepared.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div
      className="board-inline-editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <form
        className="board-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (url && !/^https?:\/\//i.test(url)) {
            setError("Use a full http or https URL.");
            return;
          }
          patch({ url });
          onClose();
        }}
      >
        {(card.kind === "link" || card.kind === "video_link" || card.kind === "audio_link") && (
          <>
            <InlineField label={card.kind === "video_link" ? "Video link" : card.kind === "audio_link" ? "Audio link" : "Link"}>
              <input
                autoFocus
                type="url"
                maxLength={2048}
                placeholder="https://…"
                value={url}
                onChange={(e) => {
                  const value = e.target.value;
                  setUrl(value);
                  if (!value || /^https?:\/\//i.test(value)) {
                    patch({ url: value });
                    setError("");
                  }
                }}
                onBlur={() => {
                  if (url && !/^https?:\/\//i.test(url)) setError("Use a full http or https URL.");
                }}
              />
              {card.kind !== "link" && (() => {
                const mode = card.kind === "audio_link" ? "audio" : "video";
                if (!url) return <p className="board-inline-hint">Works with {EMBED_PROVIDERS[mode]}.</p>;
                const found = parseEmbed(url, typeof location === "undefined" ? "" : location.hostname);
                return found
                  ? <p className="board-inline-hint" role="status">Plays inside the card · {found.provider}</p>
                  : <p className="board-inline-hint is-warning" role="status">Can&apos;t play this link inside a card. Try {EMBED_PROVIDERS[mode]}.</p>;
              })()}
              {!expanded && <p className="board-inline-hint">Drag the bottom-right corner to add a description.</p>}
            </InlineField>
            {expanded && (
              <>
                <InlineField label="Description">
                  <textarea
                    rows={Math.min(20, Math.max(2, Math.floor(((card.height ?? 0) - (card.kind === "link" ? 250 : 330)) / 17)))}
                    maxLength={20000}
                    placeholder="Why does this link matter?"
                    value={draft.body}
                    onChange={(e) => patch({ body: e.target.value })}
                  />
                </InlineField>
                {card.kind !== "link" && (
                  <InlineField label="Title">
                    <input maxLength={200} placeholder="Defaults to the page title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
                  </InlineField>
                )}
                {card.kind === "link" && (
                  <details className="board-inline-more">
                    <summary>Title &amp; image</summary>
                    <InlineField label="Title">
                      <input maxLength={200} placeholder="Defaults to the page title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
                    </InlineField>
                    <InlineField label="Custom image">
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} />
                      {uploading && <p role="status">Uploading{uploadProgress > 0 && uploadProgress < 1 ? ` · ${Math.round(uploadProgress * 100)}%` : "…"}</p>}
                      <Button type="button" onClick={() => setLibrary(true)}>
                        <ImagePlus size={15} />
                        Choose from your images
                      </Button>
                      {draft.image && (
                        <div className="board-upload-preview">
                          <img src={draft.image.startsWith("data:") ? draft.image : `/api/assets?path=${encodeURIComponent(draft.image)}`} alt="Selected reference" />
                          <Button type="button" onClick={() => patch({ image: "" })}>Remove image</Button>
                        </div>
                      )}
                    </InlineField>
                  </details>
                )}
              </>
            )}
          </>
        )}
        {card.kind !== "note" && card.kind !== "link" && card.kind !== "video_link" && card.kind !== "audio_link" && <InlineField label="Title">
          <input
            autoFocus
            maxLength={200}
            placeholder="Give this card a title"
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </InlineField>}
        {card.kind === "board" && (
          <InlineField label="Linked board">
            <select
              value={draft.target_board_id || ""}
              onChange={(e) => {
                const selected = boardChoices.find((board) => board.id === e.target.value);
                patch({ target_board_id: e.target.value || null, title: selected?.title || draft.title });
              }}
            >
              <option value="">Choose a board…</option>
              {boardChoices.map((board) => <option key={board.id} value={board.id}>{board.title}</option>)}
            </select>
          </InlineField>
        )}
        {card.kind === "color" && (
          <InlineField label="Swatch color">
            <span className="board-swatch-field">
              <input type="color" value={draft.color_value} onChange={(e) => patch({ color_value: e.target.value })} />
              <HexField value={draft.color_value} onChange={(color_value) => patch({ color_value })} />
            </span>
          </InlineField>
        )}
        {card.kind !== "group" && card.kind !== "board" && card.kind !== "color" && card.kind !== "link" && card.kind !== "video_link" && card.kind !== "audio_link" && (
          <InlineField
            label={card.kind === "scene" ? "Action & editing notes" : "Notes"}
          >
            <textarea
              autoFocus={card.kind === "note"}
              rows={5}
              maxLength={20000}
              placeholder={
                card.kind === "scene"
                  ? "What happens in this shot? Add transitions, sound, or editing direction…"
                  : "Capture an idea…"
              }
              value={draft.body}
              onChange={(e) => patch({ body: e.target.value })}
            />
          </InlineField>
        )}
        {(["image", "scene", "video", "file"] as BoardCard["kind"][]).includes(card.kind) && (
          <InlineField label={card.kind === "video" ? "Video" : card.kind === "file" ? "File" : "Image"}>
            <input
              type="file"
              accept={card.kind === "image" || card.kind === "scene" || card.kind === "link" ? "image/png,image/jpeg,image/webp,image/gif" : card.kind === "video" ? "video/mp4,video/webm,video/quicktime" : undefined}
              disabled={uploading}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            {uploading && <p role="status">Uploading{uploadProgress > 0 && uploadProgress < 1 ? ` · ${Math.round(uploadProgress * 100)}%` : "…"}</p>}
            {(card.kind === "image" || card.kind === "scene") && (
              <Button type="button" onClick={() => setLibrary(true)}>
                <ImagePlus size={15} />
                Choose from your images
              </Button>
            )}
            {draft.image && (card.kind === "image" || card.kind === "scene" || card.kind === "link") && (
              <div className="board-upload-preview">
                <img
                  src={
                    draft.image.startsWith("data:")
                      ? draft.image
                      : `/api/assets?path=${encodeURIComponent(draft.image)}`
                  }
                  alt="Selected reference"
                />
                <Button type="button" onClick={() => patch({ image: "" })}>
                  Remove image
                </Button>
              </div>
            )}
          </InlineField>
        )}
        {(["image", "video", "file"] as BoardCard["kind"][]).includes(card.kind) && (
          <InlineField label="Caption">
            <input maxLength={1000} value={draft.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Add a caption…" />
          </InlineField>
        )}
        {card.kind === "image" && draft.image && (
          <InlineField label="Image crop">
            <select value={draft.image_fit} onChange={(e) => patch({ image_fit: e.target.value as BoardCard["image_fit"] })}>
              <option value="contain">Show full image</option><option value="cover">Crop to fill card</option>
            </select>
            {draft.image_fit === "cover" && <div className="board-crop-controls">
              <label>Horizontal <input type="range" min="0" max="100" value={draft.image_position_x} onChange={(e) => patch({ image_position_x: Number(e.target.value) })} /></label>
              <label>Vertical <input type="range" min="0" max="100" value={draft.image_position_y} onChange={(e) => patch({ image_position_y: Number(e.target.value) })} /></label>
            </div>}
          </InlineField>
        )}
        {card.kind === "scene" && (
          <>
            <InlineField label="Duration / timecode">
              <input
                maxLength={80}
                placeholder="e.g. 5 seconds or 00:12–00:18"
                value={draft.duration}
                onChange={(e) => patch({ duration: e.target.value })}
              />
            </InlineField>
            <InlineField label="Dialogue / voiceover">
              <textarea
                rows={3}
                maxLength={5000}
                value={draft.dialogue}
                onChange={(e) => patch({ dialogue: e.target.value })}
              />
            </InlineField>
          </>
        )}
        {error && (
          <p className="board-error" role="alert">
            {error}
          </p>
        )}
        <div className="board-dialog-actions">
          <Button
            variant="secondary"
            aria-label="Save card"
            type="submit"
            disabled={uploading}
          >
            Done
          </Button>
        </div>
      </form>
      {library && (
        <ImageLibrary
          demo={demo}
          current={card.image}
          onPick={useLibraryImage}
          onUpload={(file) => { setLibrary(false); void upload(file); }}
          onClose={() => setLibrary(false)}
        />
      )}
    </div>
  );
}

function BoardContextMenu({
  x,
  y,
  actions,
  label = "Card actions",
  onClose,
}: {
  x: number;
  y: number;
  label?: string;
  actions: {
    label: string;
    shortcut?: string;
    color?: string;
    info?: string;
    separator?: boolean;
    danger?: boolean;
    disabled?: boolean;
    keepOpen?: boolean;
    run: () => void;
  }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const actionKey = actions.map((a) => (a.separator ? "-" : a.label)).join("|");
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
  }, [x, y, actionKey]);
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus({ preventScroll: true });
    const dismiss = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Capture phase: cards and the canvas stop propagation of their presses.
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, actionKey]);
  return createPortal(
    <div
      ref={ref}
      className="board-context-menu"
      role="menu"
      aria-label={label}
      style={{ left: Math.max(8, x), top: Math.max(8, y) }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          onClose();
          return;
        }
        const buttons = Array.from(
          ref.current!.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      {actions.map((action, index) => action.separator ? (
        <hr className="board-menu-separator" role="separator" key={`separator-${index}`} />
      ) : action.info ? (
        <div className="board-menu-info" key={`${action.info}-${action.label}`}>
          <small>{action.info}</small>
          <span>{action.label}</span>
        </div>
      ) : (
        <button
          role="menuitem"
          className={action.danger ? "is-danger" : undefined}
          disabled={action.disabled}
          key={action.label}
          onClick={() => {
            action.run();
            if (!action.keepOpen) onClose();
          }}
        >
          <span>
            {action.color && (
              <i
                className="board-menu-color"
                style={{ background: action.color }}
              />
            )}
            {action.label}
          </span>
          {action.shortcut && <small>{action.shortcut}</small>}
        </button>
      ))}
    </div>,
    document.body,
  );
}
