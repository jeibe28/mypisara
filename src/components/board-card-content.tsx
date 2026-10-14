"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Music, Pause, Volume2, VolumeX, ChevronRight, ExternalLink, Globe, GripVertical, Play, Plus, Trash2, MoreHorizontal, ArrowUp, ArrowDown } from "lucide-react";
import { headingFontStyle, type BoardCard } from "@/lib/boards";
import { EMBED_PROVIDERS, parseEmbed } from "@/lib/embeds";

export const TASK_DRAG_TYPE = "application/x-mypisara-task";

const AUDIO_LABELS: Record<string, string> = { "audio/mpeg": "MP3", "audio/mp3": "MP3", "audio/wav": "WAV", "audio/x-wav": "WAV", "audio/mp4": "M4A", "audio/x-m4a": "M4A" };
function bytesLabel(value: number) {
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function clock(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// An audio player with a full-width seek bar. The browser's own controls squeeze the seek bar to a
// few pixels inside a card, which makes scrubbing nearly impossible.
export function AudioPlayer({ src, onDuration }: { src: string; onDuration?: (seconds: number) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const stamp = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };
  const known = Number.isFinite(duration) && duration > 0;
  function seek(value: number) {
    const el = audio.current;
    if (!el) return;
    el.currentTime = value;
    setTime(value);
  }
  return (
    <div className="board-audio-player" onPointerDown={(e) => e.stopPropagation()}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const value = e.currentTarget.duration;
          if (Number.isFinite(value)) { setDuration(value); onDuration?.(value); }
        }}
        onDurationChange={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }}
        onTimeUpdate={(e) => { if (!scrubbing) setTime(e.currentTarget.currentTime); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setTime(0); }}
      />
      <button
        type="button"
        className="board-audio-play"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => { const el = audio.current; if (el) void (el.paused ? el.play() : el.pause()); }}
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <input
        type="range"
        className="board-audio-seek"
        aria-label="Seek"
        aria-valuetext={`${stamp(time)} of ${known ? stamp(duration) : "unknown"}`}
        min={0}
        max={known ? duration : 100}
        step="any"
        value={known ? Math.min(time, duration) : 0}
        disabled={!known}
        style={{ ["--played" as string]: `${known ? (Math.min(time, duration) / duration) * 100 : 0}%` }}
        onPointerDown={() => setScrubbing(true)}
        onPointerUp={() => setScrubbing(false)}
        onPointerCancel={() => setScrubbing(false)}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="board-audio-time">{stamp(time)} / {known ? stamp(duration) : "–:––"}</span>
      <button
        type="button"
        className="board-audio-mute"
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        onClick={() => { const el = audio.current; if (el) { el.muted = !el.muted; setMuted(el.muted); } }}
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
    </div>
  );
}

// Uploaded audio: file name, format · size · length, the player, and a visible download.
export function AudioFileCard({ card, src }: { card: BoardCard; src: string }) {
  const [duration, setDuration] = useState(0);
  const name = card.file_name || card.title || "Audio file";
  const meta = [AUDIO_LABELS[card.file_type] || card.file_type.replace("audio/", "").toUpperCase(), bytesLabel(card.file_size), duration ? clock(duration) : ""]
    .filter(Boolean).join(" · ");
  return <div className="board-audio-file">
    <div className="board-audio-head">
      <span className="board-audio-icon" aria-hidden="true"><Music size={16} /></span>
      <div className="board-audio-text"><strong title={meta ? `${name} · ${meta}` : name}>{name}</strong><small>{meta}</small></div>
      <a className="board-audio-download" href={src} download={name} aria-label={`Download ${name}`} title="Download"
        onPointerDown={(e) => e.stopPropagation()}><Download size={15} /></a>
    </div>
    <AudioPlayer src={src} onDuration={setDuration} />
  </div>;
}

export function LinkCard({ card, assetImage = "" }: { card: BoardCard; assetImage?: string }) {
  const preview = card.link_preview?.url === card.url ? card.link_preview : null;
  const [failedImage, setFailedImage] = useState("");
  const image = assetImage || preview?.image || "";
  let domain = "";
  try { domain = new URL(card.url).hostname.replace(/^www\./, ""); } catch { /* Empty link. */ }
  return <div className="board-link-preview">
    {card.link_show_image && image && failedImage !== image &&
      <img className="board-link-thumbnail" src={image} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setFailedImage(image)} />}
    <div className="board-link-summary">
      <h3>{card.title || preview?.title || domain || "Add a link"}</h3>
      {card.url ? <a className="board-link-domain" href={card.url} target="_blank" rel="noopener noreferrer" draggable={false}>
        <Globe size={13} /><span>{preview?.site_name || domain}</span><ExternalLink size={12} />
      </a> : <p className="board-card-hint">Double-click to paste a website URL</p>}
      {card.link_show_description && (card.body || preview?.description) && <p className="board-link-description">{card.body || preview?.description}</p>}
    </div>
  </div>;
}

// Plays a pasted video or audio link inside the card. Video shows a poster and
// loads the player on click, so a board full of videos stays light.
export function EmbedCard({ card }: { card: BoardCard }) {
  const [playing, setPlaying] = useState(false);
  const mode = card.kind === "audio_link" ? "audio" : "video";
  const embed = card.url ? parseEmbed(card.url, typeof location === "undefined" ? "" : location.hostname) : null;
  const sandbox = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";
  const allow = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write";
  // Page title and thumbnail come from the shared link preview once it loads.
  const preview = card.link_preview?.url === card.url ? card.link_preview : null;
  const title = card.title || preview?.title || (embed ? `${embed.provider} ${mode}` : "");
  let domain = "";
  try { domain = new URL(card.url).hostname.replace(/^www\./, ""); } catch { /* Empty link. */ }
  const thumbnail = embed && embed.type === "iframe" ? embed.thumbnail || preview?.image : undefined;
  return <div className="board-embed">
    {!card.url ? <p className="board-card-hint">Double-click to paste a {mode} link</p>
      : !embed ? <div className="board-embed-empty">
        <p>This link can&apos;t play inside a card.</p>
        <small>Supported: {EMBED_PROVIDERS[mode]}.</small>
      </div>
      : embed.type === "file" ? (embed.media === "video"
        ? <video className="board-card-video" src={embed.src} controls preload="metadata" />
        : <AudioPlayer src={embed.src} />)
      : embed.media === "audio" ? <iframe className="board-embed-frame" title={card.title || `${embed.provider} player`}
          src={embed.src} height={embed.height} loading="lazy" sandbox={sandbox} allow={allow} referrerPolicy="strict-origin-when-cross-origin" />
      : <div className="board-embed-video" style={{ aspectRatio: embed.aspect }}>
        {playing
          ? <iframe className="board-embed-frame" title={card.title || `${embed.provider} player`}
              src={embed.autoplaySrc ?? embed.src} sandbox={sandbox} allow={allow} allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <button className="board-embed-poster" aria-label={`Play video from ${embed.provider}`} onClick={() => setPlaying(true)}>
              {thumbnail && <img src={thumbnail} alt="" draggable={false} referrerPolicy="no-referrer" />}
              <span className="board-embed-play"><Play size={22} fill="currentColor" /></span>
              <small>{embed.provider}</small>
            </button>}
      </div>}
    {card.url && embed && <div className="board-embed-meta">
      {title && <h3>{title}</h3>}
      {card.body && <p className="board-link-description">{card.body}</p>}
      <a className="board-link-domain board-embed-open" href={card.url} target="_blank" rel="noopener noreferrer" draggable={false}>
        <Globe size={13} /><span>{domain || embed.provider}</span><ExternalLink size={12} />
      </a>
    </div>}
  </div>;
}

export function HeadingEditor({ card, onChange, onClose }: {
  card: BoardCard; onChange: (patch: Partial<BoardCard>) => void; onClose: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  // Grow with the text so a heading can run to as many lines as it needs.
  const fit = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => fit(field.current), [card.title, card.heading_size, card.heading_font]);
  // Enter starts a new line; Escape, ⌘/Ctrl+Enter or clicking away finishes.
  return <textarea ref={field} className="board-heading-input" aria-label="Heading text" autoFocus rows={1} maxLength={200}
    value={card.title} placeholder="Heading" style={{ textAlign: card.heading_align, ...headingFontStyle(card) }}
    onFocus={(e) => { const el = e.currentTarget; el.setSelectionRange(el.value.length, el.value.length); fit(el); }}
    onChange={(e) => { fit(e.currentTarget); onChange({ title: e.target.value }); }}
    onBlur={onClose}
    onKeyDown={(e) => {
      if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === "Enter") e.stopPropagation();
    }} />;
}

export function TodoCard({ card, onChange, editing = false, onClose }: { card: BoardCard; onChange: (patch: Partial<BoardCard>) => void; editing?: boolean; onClose?: () => void }) {
  const [newTask, setNewTask] = useState("");
  const [details, setDetails] = useState<string | null>(null);
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const addField = useRef<HTMLInputElement>(null);
  const tasks = card.tasks;
  const doneCount = tasks.filter((task) => task.done).length;
  // Finished items can be tucked away while editing is off; progress still counts them.
  const visibleTasks = card.hide_done && !editing ? tasks.filter((task) => !task.done) : tasks;
  const update = (id: string, patch: Partial<BoardCard["tasks"][number]>) => onChange({ tasks: tasks.map((task) => task.id === id ? { ...task, ...patch } : task) });
  const focus = (id: string) => requestAnimationFrame(() => fields.current.get(id)?.focus({ preventScroll: true }));
  function insert(after: number, text = "") {
    if (tasks.length >= 100) return;
    const task = { id: crypto.randomUUID(), text, done: false, indent: tasks[after]?.indent || 0, assignee: "", due_date: "" };
    onChange({ tasks: [...tasks.slice(0, after + 1), task, ...tasks.slice(after + 1)] });
    focus(task.id);
  }
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= tasks.length || to >= tasks.length) return;
    const next = [...tasks];
    const [task] = next.splice(from, 1); next.splice(to, 0, task);
    onChange({ tasks: next }); focus(task.id);
  }
  function remove(index: number) {
    onChange({ tasks: tasks.filter((_, i) => i !== index) });
    if (index > 0) focus(tasks[index - 1].id); else requestAnimationFrame(() => addField.current?.focus({ preventScroll: true }));
  }
  return <div className="board-todo-list" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); e.currentTarget.querySelector<HTMLElement>(":focus")?.blur(); } }}>
    {/* Lists are title-less by default; an existing title stays editable so it can be cleared. */}
    {editing && card.title ? <label className="board-todo-title">Title<input aria-label="Title" maxLength={200} value={card.title} placeholder="List title" onChange={(e) => onChange({ title: e.target.value })} /></label> : card.title && <h3>{card.title}</h3>}
    {/* Progress only appears once something is done, so a fresh list stays as small as its items. */}
    {doneCount > 0 && <div className="board-todo-progress" aria-label={`${doneCount} of ${tasks.length} done`}>
      <div className="board-todo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={doneCount}>
        <span style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
      </div>
      <small>{doneCount} / {tasks.length}</small>
    </div>}
    {card.hide_done && !editing && doneCount > 0 && <p className="board-todo-hidden">{doneCount} completed hidden</p>}
    {visibleTasks.map((task) => { const index = tasks.indexOf(task); return <div key={task.id} className={`board-todo-item ${task.done ? "is-done" : ""}`}
      style={{ paddingLeft: (task.indent || 0) * 18 }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(TASK_DRAG_TYPE)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; } }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
        e.preventDefault(); e.stopPropagation();
        const [cardId, taskId] = e.dataTransfer.getData(TASK_DRAG_TYPE).split(":");
        if (cardId === card.id) reorder(tasks.findIndex((t) => t.id === taskId), index);
      }}>
      <div className="board-todo-row">
        <button className="board-task-grip" aria-label={`Move task ${index + 1}`} draggable
          onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData(TASK_DRAG_TYPE, `${card.id}:${task.id}`); e.dataTransfer.effectAllowed = "move"; }}
          onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); reorder(index, index + (e.key === "ArrowUp" ? -1 : 1)); } }}><GripVertical size={13} /></button>
        <input type="checkbox" aria-label={task.text || `Complete task ${index + 1}`} checked={task.done} onChange={() => update(task.id, { done: !task.done })} />
        <textarea aria-label={`Task ${index + 1}`} rows={1} maxLength={1000} value={task.text} placeholder="To-do…"
          ref={(el) => { if (el) { fields.current.set(task.id, el); el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } else fields.current.delete(task.id); }}
          onChange={(e) => update(task.id, { text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (task.text.trim()) insert(index); else remove(index); }
            if (e.key === "Backspace" && !task.text) { e.preventDefault(); remove(index); }
            if (e.key === "Tab") { e.preventDefault(); update(task.id, { indent: Math.max(0, Math.min(3, (task.indent || 0) + (e.shiftKey ? -1 : 1))) }); }
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); reorder(index, index + (e.key === "ArrowUp" ? -1 : 1)); }
          }} />
        <button className="board-task-options" aria-label={`Task ${index + 1} options`} aria-expanded={details === task.id} onClick={() => setDetails(details === task.id ? null : task.id)}><MoreHorizontal size={14} /></button>
        {task.done && <button className="board-task-delete" aria-label={`Delete task ${index + 1}`} onClick={() => remove(index)}><Trash2 size={13} /></button>}
      </div>
      {(task.assignee || task.due_date) && details !== task.id && <div className="board-todo-meta">{task.assignee && <span>{task.assignee}</span>}{task.due_date && <time dateTime={task.due_date}>{task.due_date}</time>}</div>}
      {details === task.id && <div className="board-todo-details">
        <input aria-label={`Task ${index + 1} assignee`} placeholder="Assign to…" value={task.assignee} maxLength={200} onChange={(e) => update(task.id, { assignee: e.target.value })} />
        <input aria-label={`Task ${index + 1} due date`} type="date" value={task.due_date} onChange={(e) => update(task.id, { due_date: e.target.value })} />
        <div><button aria-label={`Move task ${index + 1} up`} disabled={!index} onClick={() => reorder(index, index - 1)}><ArrowUp size={13} /></button>
          <button aria-label={`Move task ${index + 1} down`} disabled={index === tasks.length - 1} onClick={() => reorder(index, index + 1)}><ArrowDown size={13} /></button>
          <button aria-label={`Delete task ${index + 1}`} onClick={() => remove(index)}><Trash2 size={13} /></button></div>
      </div>}
    </div>; })}
    <div className="board-todo-add"><Plus size={14} /><input ref={addField} autoFocus={editing} aria-label="New checklist item" placeholder="Add a to-do…" value={newTask} disabled={tasks.length >= 100} maxLength={1000}
      onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newTask.trim()) { insert(tasks.length - 1, newTask.trim()); setNewTask(""); } } }} />
      {newTask.trim() && <button onClick={() => { insert(tasks.length - 1, newTask.trim()); setNewTask(""); }}>Add</button>}
    </div>
    {editing && <button className="board-todo-done" aria-label="Save card" onClick={onClose}>Done</button>}
  </div>;
}

// A card folded down to one line: icon, a summary and an expand button.
export function CollapsedCard({ card, icon: Icon, label, onExpand }: {
  card: BoardCard;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onExpand: () => void;
}) {
  let domain = "";
  try { domain = card.url ? new URL(card.url).hostname.replace(/^www\./, "") : ""; } catch { /* Not a URL. */ }
  const summary =
    card.title.trim() ||
    card.body.trim().split("\n")[0] ||
    (card.tasks.find((task) => !task.done && task.text.trim()) ?? card.tasks.find((task) => task.text.trim()))?.text ||
    domain ||
    card.file_name ||
    label;
  const done = card.tasks.filter((task) => task.done).length;
  return <div className="board-collapsed">
    <Icon size={15} />
    <span className="board-collapsed-title">{summary}</span>
    {card.kind === "checklist" && card.tasks.length > 0 && <small>{done}/{card.tasks.length}</small>}
    <button aria-label={`Expand ${summary}`} title="Expand" onClick={(e) => { e.stopPropagation(); onExpand(); }}>
      <ChevronRight size={15} />
    </button>
  </div>;
}
