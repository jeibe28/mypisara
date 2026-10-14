"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button, Modal } from "./ui";

type LibraryItem = {
  path: string;
  size: number;
  uploaded_at: string;
  used_on: { id: string; title: string }[];
};

const assetUrl = (path: string) => (path.startsWith("data:") ? path : `/api/assets?path=${encodeURIComponent(path)}`);

function sizeLabel(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Demo mode keeps images inside each board in this browser, so the library is built from those.
function demoItems(): LibraryItem[] {
  try {
    const boards = JSON.parse(localStorage.getItem("mypisara.boards.demo.v1") || "[]");
    const seen = new Map<string, LibraryItem>();
    for (const board of Array.isArray(boards) ? boards : [])
      for (const card of Array.isArray(board?.cards) ? board.cards : []) {
        const image = typeof card?.image === "string" ? card.image : "";
        if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(image)) continue;
        const item: LibraryItem = seen.get(image) ?? { path: image, size: Math.round(image.length * 0.75), uploaded_at: "", used_on: [] };
        if (!item.used_on.some((use) => use.id === board.id)) item.used_on.push({ id: board.id, title: board.title });
        seen.set(image, item);
      }
    return [...seen.values()];
  } catch {
    return [];
  }
}

// Pick from images already uploaded to this account, or upload a new one. Choosing an existing
// image reuses the stored file, so it costs no extra storage and appears instantly.
export function ImageLibrary({ demo, current, onPick, onUpload, onClose }: {
  demo: boolean;
  current?: string;
  onPick: (item: { path: string; size: number }) => void;
  onUpload: (file: File) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    if (demo) {
      setItems(demoItems());
      return;
    }
    try {
      const response = await fetch("/api/assets?list=1", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't load your images.");
      setItems(data.items as LibraryItem[]);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Couldn't load your images.");
    }
  }, [demo]);
  useEffect(() => { void load(); }, [load]);

  async function remove(path: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't delete that image.");
      setConfirm(null);
      setItems((list) => (list ?? []).filter((item) => item.path !== path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that image.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Your images"
      description={demo ? "Images already on your boards in this browser." : "Images you've uploaded to your account. Pick one to reuse it."}
      onClose={onClose}
    >
      <div className="image-library">
        <div className="image-library-bar">
          <span>{items === null ? "Loading…" : `${items.length} ${items.length === 1 ? "image" : "images"}`}</span>
          <Button variant="primary" onClick={() => input.current?.click()}>
            <ImagePlus size={15} />
            Upload new
          </Button>
          <input
            ref={input}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Upload an image"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {items !== null && !items.length && !error && (
          <div className="image-library-empty">
            <ImagePlus size={28} />
            <p>No images yet. Upload one and it will be here next time.</p>
          </div>
        )}
        {items === null && <div className="skeleton" style={{ height: 120 }} aria-label="Loading images" />}
        {!!items?.length && (
          <ul className="image-library-grid" aria-label="Your uploaded images">
            {items.map((item) => {
              const uses = item.used_on.length;
              const unused = uses === 0;
              return (
                <li key={item.path} className={item.path === current ? "is-current" : undefined}>
                  <button
                    className="image-library-pick"
                    aria-label={`Use this image${uses ? `, used on ${uses} ${uses === 1 ? "board" : "boards"}` : ""}`}
                    onClick={() => onPick({ path: item.path, size: item.size })}
                  >
                    <img src={assetUrl(item.path)} alt="" loading="lazy" decoding="async" draggable={false} />
                  </button>
                  <div className="image-library-meta">
                    <small title={item.used_on.map((use) => use.title).join(", ")}>
                      {unused ? "Not used yet" : `Used on ${uses} ${uses === 1 ? "board" : "boards"}`}
                    </small>
                    {!demo && unused && (confirm === item.path ? (
                      <span className="image-library-confirm">
                        <button disabled={busy} onClick={() => void remove(item.path)}>Delete</button>
                        <button disabled={busy} onClick={() => setConfirm(null)}>Keep</button>
                      </span>
                    ) : (
                      <button className="image-library-delete" aria-label="Delete this image" title="Delete this image" onClick={() => setConfirm(item.path)}>
                        <Trash2 size={13} />
                      </button>
                    ))}
                  </div>
                  <small className="image-library-size">{sizeLabel(item.size)}{item.uploaded_at ? ` · ${new Date(item.uploaded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</small>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
