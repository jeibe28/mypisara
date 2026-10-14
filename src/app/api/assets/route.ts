import { del, get, list, put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { configured, currentUser } from "@/lib/auth";
import { BOARD_ASSET_TYPES, boardAssetLimit, boardAssetLimitLabel } from "@/lib/boards";
import { withOwner } from "@/lib/neon/database";
import { parseRange, sliceStream } from "@/lib/http-range";

function unavailable() {
  return !configured() || !process.env.BLOB_READ_WRITE_TOKEN;
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;

// Total storage per account, so one account can't grow the storage bill without limit.
const STORAGE_QUOTA_BYTES = (Number(process.env.STORAGE_QUOTA_MB) || 1024) * 1024 * 1024;
const quotaLabel = () => `${Math.round(STORAGE_QUOTA_BYTES / 1_048_576).toLocaleString("en-US")} MB`;

async function storageUsed(owner: string) {
  let used = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `board-assets/${owner}/`, cursor, limit: 1000 });
    for (const blob of page.blobs) used += blob.size;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return used;
}

const quotaError = () => `Your storage is full (${quotaLabel()}). Delete unused images to make room.`;

// Which of this user's boards (including deleted ones and card trash) point at each file.
// A file is only "unused" when nothing could still show it, so deleting it is always safe.
async function boardsUsing(owner: string) {
  const found = await withOwner(owner, async (db) =>
    (await db.query("select id, title, cards, trash from boards where owner_id=$1", [owner])).rows,
  );
  const usage = new Map<string, Map<string, string>>();
  for (const board of found as { id: string; title: string; cards: unknown; trash: unknown }[]) {
    for (const list of [board.cards, board.trash]) {
      if (!Array.isArray(list)) continue;
      for (const card of list as { image?: unknown }[]) {
        const image = typeof card?.image === "string" ? card.image : "";
        if (!image) continue;
        if (!usage.has(image)) usage.set(image, new Map());
        usage.get(image)!.set(board.id, board.title);
      }
    }
  }
  return usage;
}

export async function POST(request: Request) {
  if (unavailable())
    return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Big files are uploaded by the browser straight to storage. This branch answers its handshake:
  // it checks who is asking, what the file is and how large it may be, then issues a one-file token.
  if ((request.headers.get("content-type") || "").includes("application/json")) {
    try {
      const body = (await request.json()) as HandleUploadBody;
      const result = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const claimed = (() => {
            try { return JSON.parse(clientPayload || "{}") as { type?: unknown; size?: unknown }; } catch { return {}; }
          })();
          const type = typeof claimed.type === "string" ? claimed.type : "";
          if (!pathname.startsWith(`board-assets/${user.id}/`) || pathname.includes(".."))
            throw new Error("Invalid upload location.");
          if (!BOARD_ASSET_TYPES.includes(type)) throw new Error("This file type isn't supported.");
          // The claimed size can't be trusted, so the token itself only allows what is left.
          const remaining = STORAGE_QUOTA_BYTES - (await storageUsed(user.id));
          if (remaining <= 0) throw new Error(quotaError());
          return {
            allowedContentTypes: [type],
            maximumSizeInBytes: Math.min(boardAssetLimit(type), remaining),
            addRandomSuffix: true,
            cacheControlMaxAge: 3600,
          };
        },
      });
      return NextResponse.json(result);
    } catch (error) {
      console.error("Direct upload handshake failed", error);
      return NextResponse.json({ error: "Upload isn't allowed." }, { status: 400 });
    }
  }

  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || !BOARD_ASSET_TYPES.includes(file.type))
    return NextResponse.json(
      { error: "Choose an image, PDF, video, audio, text, ZIP, or DOCX file." },
      { status: 400 },
    );
  if (file.size > boardAssetLimit(file.type))
    return NextResponse.json(
      { error: `${file.type.startsWith("image/") ? "Images" : "This file type"} can be up to ${boardAssetLimitLabel(file.type)}.` },
      { status: 400 },
    );
  try {
    if ((await storageUsed(user.id)) + file.size > STORAGE_QUOTA_BYTES)
      return NextResponse.json({ error: quotaError() }, { status: 413 });
    const extension =
      file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
      file.type.split("/")[1];
    const blob = await put(`board-assets/${user.id}/asset.${extension}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      cacheControlMaxAge: 3600,
    });
    return NextResponse.json({ path: blob.pathname });
  } catch (error) {
    console.error("Asset upload failed", error);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  if (unavailable()) return new NextResponse(null, { status: 503 });
  const user = await currentUser();
  const params = new URL(request.url).searchParams;
  // Where this account's files live, so the browser can name a direct upload correctly.
  if (params.get("prefix")) {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ prefix: `board-assets/${user.id}/` }, { headers: { "Cache-Control": "private, no-store" } });
  }
  // How much of the account's storage is used, checked before a direct upload starts.
  if (params.get("usage")) {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      return NextResponse.json(
        { used: await storageUsed(user.id), quota: STORAGE_QUOTA_BYTES, error: quotaError() },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      console.error("Storage usage failed", error);
      return NextResponse.json({ error: "Couldn't check your storage. Try again." }, { status: 503 });
    }
  }
  // The image library: everything this user has uploaded, newest first, with where it is used.
  if (params.get("list")) {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const prefix = `board-assets/${user.id}/`;
      const blobs: { pathname: string; size: number; uploadedAt: Date }[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, limit: 200 });
        blobs.push(...page.blobs);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor && blobs.length < 1000);
      const usage = await boardsUsing(user.id);
      const items = blobs
        .filter((blob) => IMAGE_FILE.test(blob.pathname))
        .sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))
        .map((blob) => ({
          path: blob.pathname,
          size: blob.size,
          uploaded_at: new Date(blob.uploadedAt).toISOString(),
          used_on: [...(usage.get(blob.pathname) ?? new Map<string, string>()).entries()].map(([id, title]) => ({ id, title })),
        }));
      return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      console.error("Image library failed", error);
      return NextResponse.json({ error: "Couldn't load your images. Try again." }, { status: 503 });
    }
  }
  const path = params.get("path");
  if (!user || !path || !path.startsWith(`board-assets/${user.id}/`) || path.includes(".."))
    return new NextResponse(null, { status: 403 });
  // Audio and video need byte ranges: without them a browser can't jump to a position (scrub)
  // until the whole file has downloaded.
  const range = request.headers.get("range");
  const result = await get(path, { access: "private", ...(range ? { headers: { Range: range } } : {}) });
  if (!result || result.statusCode !== 200) return new NextResponse(null, { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": result.blob.contentType,
    "Cache-Control": "private, max-age=300",
    ETag: result.blob.etag,
    "Accept-Ranges": "bytes",
  };
  if (range) {
    const upstream = result.headers.get("content-range");
    if (upstream) {
      // Storage already answered with just the requested bytes.
      const length = result.headers.get("content-length");
      return new NextResponse(result.stream, {
        status: 206,
        headers: { ...headers, "Content-Range": upstream, ...(length ? { "Content-Length": length } : {}) },
      });
    }
    // Storage ignored the range and sent everything: cut the requested bytes out here.
    const total = result.blob.size;
    const parsed = parseRange(range, total);
    if (parsed === "invalid")
      return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } });
    if (parsed) {
      return new NextResponse(sliceStream(result.stream, parsed.start, parsed.end), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${parsed.start}-${parsed.end}/${total}`,
          "Content-Length": String(parsed.end - parsed.start + 1),
        },
      });
    }
  }
  if (result.blob.size) headers["Content-Length"] = String(result.blob.size);
  return new NextResponse(result.stream, { headers });
}

// Remove an uploaded image, but only when no board (or board trash) still uses it.
export async function DELETE(request: Request) {
  if (unavailable()) return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => null);
  const path = typeof input?.path === "string" ? input.path : "";
  if (!path.startsWith(`board-assets/${user.id}/`) || path.includes("..") || !IMAGE_FILE.test(path))
    return NextResponse.json({ error: "Invalid file." }, { status: 400 });
  try {
    const users = (await boardsUsing(user.id)).get(path);
    if (users?.size)
      return NextResponse.json(
        { error: `This image is used on ${users.size} ${users.size === 1 ? "board" : "boards"}.`, used_on: [...users.values()] },
        { status: 409 },
      );
    await del(path);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Image delete failed", error);
    return NextResponse.json({ error: "Couldn't delete that image. Try again." }, { status: 503 });
  }
}
