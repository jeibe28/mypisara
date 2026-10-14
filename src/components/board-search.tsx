"use client";
import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

// Floating find bar for a board: text search plus tag chips that filter cards.
export function BoardSearchBar({
  query,
  tags,
  activeTags,
  count,
  index,
  onQuery,
  onToggleTag,
  onStep,
  onClose,
}: {
  query: string;
  tags: string[];
  activeTags: string[];
  count: number;
  index: number;
  onQuery: (value: string) => void;
  onToggleTag: (tag: string) => void;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const filtering = query.trim() !== "" || activeTags.length > 0;
  return (
    <div className="board-search" role="search" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="board-search-row">
        <Search size={15} aria-hidden="true" />
        <input
          ref={input}
          aria-label="Search this board"
          placeholder="Search this board…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onStep(e.shiftKey ? -1 : 1);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        {filtering && (
          <span className="board-search-count" role="status">
            {count ? `${Math.min(index + 1, count)} of ${count}` : "No matches"}
          </span>
        )}
        <button aria-label="Previous match" disabled={!count} onClick={() => onStep(-1)}><ChevronUp size={15} /></button>
        <button aria-label="Next match" disabled={!count} onClick={() => onStep(1)}><ChevronDown size={15} /></button>
        <button aria-label="Close search" onClick={onClose}><X size={15} /></button>
      </div>
      {tags.length > 0 && (
        <div className="board-search-tags" role="group" aria-label="Filter by tag">
          {tags.map((tag) => (
            <button
              key={tag}
              className="board-tag"
              aria-pressed={activeTags.includes(tag)}
              onClick={() => onToggleTag(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
