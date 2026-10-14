"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { Board } from "@/lib/boards";
import {
  EXPORT_FORMATS,
  encodeExport,
  exportBoardAs,
  renderExport,
  type ExportFormat,
  type ExportRender,
} from "@/lib/board-export";
import { maxScaleFor, type CaptureBackground } from "@/lib/board-capture";
import { Button, Modal } from "./ui";

const QUALITIES = [
  { id: "low", label: "Smaller file", value: 0.6 },
  { id: "balanced", label: "Balanced", value: 0.8 },
  { id: "high", label: "Best quality", value: 0.92 },
] as const;
const SCALES = [
  { value: 1, label: "Standard" },
  { value: 2, label: "High" },
  { value: 3, label: "Ultra" },
] as const;

function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function ExportDialog({
  board,
  selectionIds,
  assetUrl,
  captureRoot,
  onClose,
}: {
  board: Board;
  selectionIds?: string[];
  assetUrl: (path: string) => string;
  // The open board's canvas. When given, exports match the screen exactly.
  captureRoot?: () => HTMLElement | null;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scope, setScope] = useState<"board" | "selection">(selectionIds?.length ? "selection" : "board");
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]["id"]>("high");
  const [background, setBackground] = useState<CaptureBackground>("board");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [base, setBase] = useState<{ width: number; height: number; bytes: number; ready: boolean } | null>(null);
  const hasSelection = Boolean(selectionIds?.length);
  const isPicture = format === "png" || format === "jpeg" || format === "pdf";
  const exact = Boolean(captureRoot?.());
  const qualityValue = QUALITIES.find((item) => item.id === quality)!.value;
  const effectiveBackground: CaptureBackground = format === "png" ? background : background === "transparent" ? "board" : background;
  const baseCache = useRef<{ key: string; render: ExportRender } | null>(null);

  const options = (extra: { scale: number }) => ({
    ids: scope === "selection" ? selectionIds : undefined,
    assetUrl,
    scale: extra.scale,
    quality: qualityValue,
    background: effectiveBackground,
    captureRoot: captureRoot?.() ?? null,
  });

  // Draw the board once at 1x, encode it the chosen way, and scale that measurement up to estimate
  // the real file. Re-runs (debounced) when the choices change.
  useEffect(() => {
    if (!isPicture) return;
    let cancelled = false;
    setBase((previous) => (previous ? { ...previous, ready: false } : null));
    const timer = window.setTimeout(async () => {
      try {
        const key = `${scope}|${effectiveBackground}`;
        let render = baseCache.current?.key === key ? baseCache.current.render : null;
        if (!render) {
          render = await renderExport(board, options({ scale: 1 }));
          baseCache.current = { key, render };
        }
        const blob = await encodeExport(format as "png" | "jpeg" | "pdf", render, qualityValue);
        if (!cancelled) setBase({ width: render.width, height: render.height, bytes: blob.size, ready: true });
      } catch {
        if (!cancelled) setBase(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, scope, quality, effectiveBackground, isPicture]);

  const largest = base ? Math.max(1, maxScaleFor({ x: 0, y: 0, width: base.width, height: base.height })) : 3;
  useEffect(() => {
    if (scale > largest) setScale(largest as 1 | 2 | 3);
  }, [largest, scale]);
  // File size grows more slowly than pixel count (flat colors and smooth edges compress better as
  // they get bigger), so the 1x measurement is scaled by about scale^1.4, not scale^2.
  const estimateBytes = base ? Math.round(base.bytes * Math.pow(scale, 1.4)) : 0;

  async function run() {
    setBusy(true);
    setError("");
    try {
      await exportBoardAs(board, format, options({ scale }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed. Try another format.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Export board" description={`“${board.title}”`} onClose={() => !busy && onClose()}>
      <div className="board-form">
        <div role="radiogroup" aria-label="Export format" className="export-options">
          {EXPORT_FORMATS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={format === item.value}
              className="choice export-choice"
              onClick={() => setFormat(item.value)}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </div>
        {hasSelection && isPicture && (
          <div role="radiogroup" aria-label="What to export" className="choice-group">
            <button type="button" role="radio" aria-checked={scope === "board"} className="choice" onClick={() => setScope("board")}>
              Whole board
            </button>
            <button type="button" role="radio" aria-checked={scope === "selection"} className="choice" onClick={() => setScope("selection")}>
              Selected cards ({selectionIds!.length})
            </button>
          </div>
        )}
        {isPicture && (
          <>
            <fieldset className="export-group">
              <legend>Resolution</legend>
              <div role="radiogroup" aria-label="Resolution" className="choice-group">
                {SCALES.map((item) => {
                  const disabled = item.value > largest;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="radio"
                      aria-checked={scale === item.value}
                      disabled={disabled}
                      title={disabled ? "Too large for this board" : undefined}
                      className="choice export-scale"
                      onClick={() => setScale(item.value)}
                    >
                      <span>
                        <strong>{item.value}× {item.label}</strong>
                        <small>{base ? `${Math.round(base.width * item.value)} × ${Math.round(base.height * item.value)} px` : "…"}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {format !== "png" && (
              <fieldset className="export-group">
                <legend>Quality</legend>
                <div role="radiogroup" aria-label="Quality" className="choice-group">
                  {QUALITIES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={quality === item.id}
                      className="choice"
                      onClick={() => setQuality(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {format !== "pdf" && exact && (
              <fieldset className="export-group">
                <legend>Background</legend>
                <div role="radiogroup" aria-label="Background" className="choice-group">
                  {([
                    ["board", "Board color"],
                    ["white", "White"],
                    ...(format === "png" ? [["transparent", "Transparent"]] : []),
                  ] as [CaptureBackground, string][]).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={effectiveBackground === id}
                      className="choice"
                      onClick={() => setBackground(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="export-estimate" role="status" aria-live="polite">
              {base
                ? <>Estimated file size: <strong>about {sizeLabel(estimateBytes)}</strong>{base.ready ? "" : " · updating…"}</>
                : "Estimating size…"}
            </p>
            {!exact && (
              <p className="export-note">
                Exporting from the boards list redraws the board in a simplified way. Open the board and export from
                there for an exact copy of what you see.
              </p>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="board-dialog-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={run} disabled={busy}>
            <Download size={15} />
            {busy ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
