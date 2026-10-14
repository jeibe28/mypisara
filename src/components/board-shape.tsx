"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, ChevronDown, RotateCcw, Shuffle } from "lucide-react";
import type { BoardCard } from "@/lib/boards";
import { SHAPES, SHAPE_IDS, shapePath, type ShapeId } from "@/lib/board-shapes";

const FALLBACK_HEIGHT = 120;

// A drawn shape with an optional label. The box is transparent, and an unfilled shape only takes
// clicks on its stroke, so a circle drawn around other cards never blocks them.
export function ShapeCard({ card, editing, onChange, onClose }: {
  card: BoardCard;
  editing: boolean;
  onChange: (patch: Partial<BoardCard>) => void;
  onClose: () => void;
}) {
  const w = card.width;
  const h = card.height ?? FALLBACK_HEIGHT;
  const meta = SHAPES[card.shape];
  const d = useMemo(
    () => shapePath(card.shape, w, h, { sketchy: card.sketchy, seed: card.shape_seed, inset: card.line_weight / 2 + 2 }),
    [card.shape, w, h, card.sketchy, card.shape_seed, card.line_weight],
  );
  const highlight = card.shape === "highlight";
  const filled = !!card.background_color && meta.closed && !highlight;
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) field.current?.focus(); }, [editing]);
  return (
    <div className="board-shape" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path
          d={d}
          fill={highlight ? card.line_color : filled ? card.background_color! : "none"}
          fillOpacity={highlight ? 0.38 : undefined}
          stroke={highlight ? "none" : card.line_color}
          strokeWidth={card.line_weight}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={card.line_dashed ? `${card.line_weight * 3} ${card.line_weight * 2.4}` : undefined}
          pointerEvents={filled || highlight ? "all" : "stroke"}
          className="board-shape-path"
        />
      </svg>
      {editing ? (
        <textarea
          ref={field}
          className="board-shape-label is-editing"
          aria-label="Shape text"
          maxLength={200}
          placeholder="Text"
          rows={1}
          value={card.title}
          style={card.label_color ? { color: card.label_color } : undefined}
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); onClose(); }
          }}
        />
      ) : card.title ? (
        <div className="board-shape-label" style={card.label_color ? { color: card.label_color } : undefined}>{card.title}</div>
      ) : null}
    </div>
  );
}

function Thumb({ shape, active }: { shape: ShapeId; active?: boolean }) {
  const d = shapePath(shape, 68, 48, { inset: 5 });
  const highlight = shape === "highlight";
  return (
    <svg width="34" height="24" viewBox="0 0 68 48" aria-hidden="true">
      <path d={d} fill={highlight ? "currentColor" : "none"} fillOpacity={highlight ? 0.35 : undefined}
        stroke={highlight ? "none" : "currentColor"} strokeWidth={active ? 4 : 3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const WEIGHTS = [{ label: "Thin", value: 1.5 }, { label: "Medium", value: 3 }, { label: "Thick", value: 5 }];

// Floating toolbar for a selected shape: kind, fill, outline, weight, dashed and hand-drawn.
export function ShapeToolbar({ card, onChange, side }: {
  card: BoardCard;
  onChange: (patch: Partial<BoardCard>) => void;
  side: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [card.id]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest(".board-shape-popover,.board-shape-trigger")) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const closed = SHAPES[card.shape].closed && card.shape !== "highlight";
  return (
    <div className="board-float-colors board-float-shape">
      <button className="board-shape-trigger" aria-haspopup="dialog" aria-expanded={open} title="Change shape" onClick={() => setOpen((v) => !v)}>
        <Thumb shape={card.shape} active />
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className={`board-shape-popover is-${side}`} role="dialog" aria-label="Shapes">
          {SHAPE_IDS.map((id) => (
            <button key={id} className="board-shape-option" aria-pressed={card.shape === id} title={SHAPES[id].label}
              aria-label={SHAPES[id].label} onClick={() => onChange({ shape: id })}>
              <Thumb shape={id} />
            </button>
          ))}
        </div>
      )}
      {closed && (
        <>
          <label className="board-mini-color" title="Fill color">
            <span className="board-mini-color-box" style={{ background: card.background_color ?? undefined }} />
            <input type="color" aria-label="Fill color" value={card.background_color ?? "#ffffff"}
              onChange={(e) => onChange({ background_color: e.target.value })} />
          </label>
          <button className="board-shape-tool" aria-label="No fill" title="No fill" aria-pressed={!card.background_color}
            onClick={() => onChange({ background_color: null })}><Ban size={14} /></button>
        </>
      )}
      <label className="board-mini-color" title={card.shape === "highlight" ? "Color" : "Outline color"}>
        <span className="board-mini-color-swatch" style={{ background: card.line_color }} />
        <input type="color" aria-label="Outline color" value={card.line_color}
          onChange={(e) => onChange({ line_color: e.target.value })} />
      </label>
      {card.shape !== "highlight" && (
        <span className="board-shape-weights" role="group" aria-label="Outline weight">
          {WEIGHTS.map((weight) => (
            <button key={weight.value} className="board-shape-tool" aria-pressed={card.line_weight === weight.value}
              title={weight.label} aria-label={`${weight.label} outline`} onClick={() => onChange({ line_weight: weight.value })}>
              <i style={{ height: weight.value }} />
            </button>
          ))}
        </span>
      )}
      {card.shape !== "highlight" && (
        <button className="board-shape-tool is-text" aria-pressed={card.line_dashed} title="Dashed outline"
          onClick={() => onChange({ line_dashed: !card.line_dashed })}>Dashed</button>
      )}
      {!SHAPES[card.shape].hand && (
        <button className="board-shape-tool is-text" aria-pressed={card.sketchy} title="Hand-drawn look"
          onClick={() => onChange({ sketchy: !card.sketchy })}>Sketchy</button>
      )}
      {(card.sketchy || SHAPES[card.shape].hand) && (
        <button className="board-shape-tool" aria-label="Redraw" title="Redraw (new hand-drawn variation)"
          onClick={() => onChange({ shape_seed: 1 + Math.floor(Math.random() * 99000) })}><Shuffle size={14} /></button>
      )}
      {(card.label_color) && (
        <button className="board-shape-tool" aria-label="Reset text color" title="Reset text color"
          onClick={() => onChange({ label_color: null })}><RotateCcw size={13} /></button>
      )}
      <label className="board-mini-color" title="Text color">
        <span className="board-mini-color-text" style={{ color: card.label_color ?? undefined }}>A</span>
        <input type="color" aria-label="Text color" value={card.label_color ?? "#1d1d1b"}
          onChange={(e) => onChange({ label_color: e.target.value })} />
      </label>
    </div>
  );
}
