import { toCanvas } from "html-to-image";

// Exact exports: the board is captured from the page itself, so fonts, colors, rich text, shapes,
// lines and images come out as they look on screen, instead of being redrawn approximately.

export type CaptureBackground = "board" | "white" | "transparent";

// Elements that only exist to edit the board (handles, guides, drop markers). They never export.
const EDITING_CHROME = [
  ".board-resize", ".board-note-resize", ".board-line-endpoint", ".board-line-bend-handle", ".board-guide",
  ".board-snap-dot", ".board-marquee", ".board-group-bounds", ".board-column-drop", ".board-pending",
  ".board-ghost", ".board-ghost-origin", ".board-card-actions", ".board-float", ".board-minimap",
].join(",");

// Longest side and total pixels a browser canvas can reliably hold.
export const MAX_EXPORT_SIDE = 16000;
export const MAX_EXPORT_PIXELS = 48_000_000;

export type CaptureArea = { x: number; y: number; width: number; height: number };

// Where the content sits on the canvas, with a margin, in canvas units.
export function contentArea(root: HTMLElement, allowed?: Set<string>): CaptureArea | null {
  const elements = [...root.querySelectorAll<HTMLElement>("article[data-card-id]")].filter(
    (element) => !allowed || allowed.has(element.dataset.cardId ?? ""),
  );
  if (!elements.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const element of elements) {
    minX = Math.min(minX, element.offsetLeft);
    minY = Math.min(minY, element.offsetTop);
    maxX = Math.max(maxX, element.offsetLeft + element.offsetWidth);
    maxY = Math.max(maxY, element.offsetTop + element.offsetHeight);
  }
  const pad = 40;
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  return { x, y, width: Math.ceil(maxX + pad - x), height: Math.ceil(maxY + pad - y) };
}

// The largest scale (1-3) that keeps the picture within what a browser can encode.
export function maxScaleFor(area: CaptureArea) {
  let best = 0;
  for (const scale of [1, 2, 3]) {
    const w = area.width * scale, h = area.height * scale;
    if (Math.max(w, h) <= MAX_EXPORT_SIDE && w * h <= MAX_EXPORT_PIXELS) best = scale;
  }
  return best;
}

export async function captureBoard(options: {
  root: HTMLElement;
  allowed?: Set<string>;
  scale: number;
  background: CaptureBackground;
}): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const { root, allowed, scale, background } = options;
  const area = contentArea(root, allowed);
  if (!area) throw new Error("There is nothing on the board to export yet.");
  const viewport = root.closest<HTMLElement>(".board-viewport");
  viewport?.classList.add("board-exporting");
  try {
    await document.fonts.ready;
    const color =
      background === "transparent"
        ? undefined
        : background === "white"
          ? "#ffffff"
          : getComputedStyle(viewport ?? root).backgroundColor;
    const canvas = await toCanvas(root, {
      width: area.width,
      height: area.height,
      pixelRatio: scale,
      backgroundColor: color,
      style: {
        transform: `translate(${-area.x}px, ${-area.y}px)`,
        transformOrigin: "0 0",
        width: `${root.offsetWidth}px`,
        height: `${root.offsetHeight}px`,
      },
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.matches(EDITING_CHROME)) return false;
        if (allowed && node.matches("article[data-card-id]") && !allowed.has(node.dataset.cardId ?? "")) return false;
        return true;
      },
    });
    return { canvas, width: area.width, height: area.height };
  } finally {
    viewport?.classList.remove("board-exporting");
  }
}

export const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality));

// JPEG has no transparency; paint onto white so transparent areas don't turn black.
export function flattenOnWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return flat;
}
