"use client";

import { useEffect, useRef, useState } from "react";

type Hint = { text: string; keys: string; left: number; top: number; below: boolean };

const TARGET = "button, a[href], summary, [role='button'], [role='radio'], [role='tab'], label.board-mini-color, input[type='color']";

// A fast, consistent tooltip for icon-only controls (toolbars, dock, editor bar). It reads the
// control's own label, so every toolbar button gets a hint without wiring each one by hand.
export function HoverHints() {
  const [hint, setHint] = useState<Hint | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const active = useRef<{ el: HTMLElement; title: string | null } | null>(null);

  useEffect(() => {
    const restore = () => {
      const current = active.current;
      if (current && current.title !== null) current.el.setAttribute("title", current.title);
      active.current = null;
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      restore();
      setHint(null);
    };
    const labelOf = (el: HTMLElement) => (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
    const show = (el: HTMLElement) => {
      const text = labelOf(el);
      if (!text) return;
      // Controls that already show their own words don't need the same words repeated.
      // innerText skips text that CSS hides (the dock keeps labels for screen readers only).
      const visible = (el.innerText || "").trim();
      if (visible && visible.toLowerCase() === text.toLowerCase()) return;
      if (visible.length > 2 && !el.querySelector("svg")) return;
      const title = el.getAttribute("title");
      if (title !== null) el.removeAttribute("title");
      active.current = { el, title };
      const rect = el.getBoundingClientRect();
      const below = rect.top < 52;
      setHint({
        text,
        keys: el.getAttribute("aria-keyshortcuts") || "",
        left: Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2)),
        top: below ? rect.bottom + 8 : rect.top - 8,
        below,
      });
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const el = (event.target as HTMLElement | null)?.closest?.(TARGET) as HTMLElement | null;
      if (!el || el === active.current?.el) return;
      hide();
      if (el.hasAttribute("disabled") && !labelOf(el)) return;
      timer.current = window.setTimeout(() => show(el), 140);
    };
    const out = (event: PointerEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.(TARGET);
      if (el) hide();
    };
    const focus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      // Only keyboard focus; clicking a control focuses it too and would flash a hint.
      if (target?.matches?.(":focus-visible") && target.matches(TARGET)) {
        hide();
        show(target);
      }
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", hide);
      window.removeEventListener("scroll", hide, true);
      window.clearTimeout(timer.current);
      restore();
    };
  }, []);

  if (!hint) return null;
  return (
    <div
      className={`hover-hint ${hint.below ? "is-below" : ""}`}
      role="tooltip"
      style={{ left: hint.left, top: hint.top }}
    >
      {hint.text}
      {hint.keys && <kbd>{hint.keys}</kbd>}
    </div>
  );
}
