"use client";

import { useEffect, useRef } from "react";
import type { Board } from "@/lib/boards";

export type CanvasPrefs = { grid: boolean; ruler: boolean; snap: boolean };
export const DEFAULT_CANVAS_PREFS: CanvasPrefs = { grid: true, ruler: false, snap: true };
const KEY = "mypisara:canvas";

export function readCanvasPrefs(): CanvasPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      grid: typeof saved.grid === "boolean" ? saved.grid : DEFAULT_CANVAS_PREFS.grid,
      ruler: typeof saved.ruler === "boolean" ? saved.ruler : DEFAULT_CANVAS_PREFS.ruler,
      snap: typeof saved.snap === "boolean" ? saved.snap : DEFAULT_CANVAS_PREFS.snap,
    };
  } catch {
    return DEFAULT_CANVAS_PREFS;
  }
}
export function saveCanvasPrefs(value: CanvasPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Optional. */ }
}

const BACKGROUNDS: { id: Board["background"]; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "paper", label: "Paper" },
  { id: "slate", label: "Slate" },
  { id: "sage", label: "Sage" },
  { id: "sand", label: "Sand" },
  { id: "blue", label: "Blue" },
];

// Background swatches and the grid / ruler / snapping switches, in one small panel.
export function CanvasPanel({ background, prefs, onBackground, onPrefs, onClose }: {
  background: Board["background"];
  prefs: CanvasPrefs;
  onBackground: (value: Board["background"]) => void;
  onPrefs: (value: CanvasPrefs) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest(".board-canvas-trigger")) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [onClose]);
  const switches: { id: keyof CanvasPrefs; label: string; hint: string }[] = [
    { id: "grid", label: "Grid", hint: "Show the graph lines" },
    { id: "ruler", label: "Rulers", hint: "Measure along the edges" },
    { id: "snap", label: "Snapping", hint: "Align to nearby cards and edges" },
  ];
  return (
    <div className="board-canvas-panel" ref={panel} role="dialog" aria-label="Canvas settings">
      <div className="canvas-swatches" role="radiogroup" aria-label="Background">
        {BACKGROUNDS.map((item) => (
          <button
            key={item.id}
            role="radio"
            aria-checked={background === item.id}
            aria-label={item.label}
            title={item.label}
            className={`canvas-swatch canvas-swatch-${item.id}`}
            onClick={() => onBackground(item.id)}
          />
        ))}
      </div>
      <div className="canvas-switches">
        {switches.map((item) => (
          <button
            key={item.id}
            role="switch"
            aria-checked={prefs[item.id]}
            className="canvas-switch"
            onClick={() => onPrefs({ ...prefs, [item.id]: !prefs[item.id] })}
          >
            <span className="canvas-switch-text"><strong>{item.label}</strong><small>{item.hint}</small></span>
            <i className="canvas-switch-track" aria-hidden="true"><b /></i>
          </button>
        ))}
      </div>
    </div>
  );
}

const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000];

// Rulers along the top and left edge, in canvas units, following zoom and scroll.
export function CanvasRulers({ scrollLeft, scrollTop, zoom, width, height }: {
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
  width: number;
  height: number;
}) {
  const THICK = 22;
  // Smallest step that leaves at least ~56 screen pixels between labels.
  const step = STEPS.find((candidate) => candidate * zoom >= 56) ?? STEPS[STEPS.length - 1];
  const minor = step / 5;
  const ticks = (start: number, length: number) => {
    const from = Math.floor(start / zoom / minor) * minor;
    const to = (start + length) / zoom;
    const out: { at: number; value: number; major: boolean }[] = [];
    for (let value = from; value <= to && out.length < 400; value += minor)
      out.push({ at: value * zoom - start, value: Math.round(value), major: Math.round(value / minor) % 5 === 0 });
    return out;
  };
  const horizontal = ticks(scrollLeft, width);
  const vertical = ticks(scrollTop, height);
  return (
    <div className="canvas-rulers" aria-hidden="true">
      <svg className="canvas-ruler canvas-ruler-x" width={width} height={THICK}>
        {horizontal.map((tick) => (
          <g key={tick.value}>
            <line x1={tick.at} x2={tick.at} y1={tick.major ? 8 : 15} y2={THICK} />
            {tick.major && <text x={tick.at + 3} y={10}>{tick.value}</text>}
          </g>
        ))}
      </svg>
      <svg className="canvas-ruler canvas-ruler-y" width={THICK} height={height}>
        {vertical.map((tick) => (
          <g key={tick.value}>
            <line y1={tick.at} y2={tick.at} x1={tick.major ? 8 : 15} x2={THICK} />
            {tick.major && (
              <text transform={`translate(10 ${tick.at + 3}) rotate(-90)`} textAnchor="end">{tick.value}</text>
            )}
          </g>
        ))}
      </svg>
      <span className="canvas-ruler-corner" />
    </div>
  );
}
