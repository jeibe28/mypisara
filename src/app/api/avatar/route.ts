import { del, get, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { configured, currentUser } from "@/lib/auth";
import { AVATAR_MAX_BYTES, avatarPath, avatarType } from "@/lib/avatar";

function unavailable() {
  return !configured() || !process.env.BLOB_READ_WRITE_TOKEN;
}
const sameOrigin = (request: Request) =>
  request.headers.get("origin") === new URL(request.url).origin;

export async function POST(request: Request) {
  if (unavailable())
    return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size > AVATAR_MAX_BYTES)
    return NextResponse.json({ error: "Choose a PNG, JPEG or WebP image under 1 MB." }, { status: 400 });
  const type = avatarType(new Uint8Array(await file.arrayBuffer()));
  if (!type)
    return NextResponse.json({ error: "Choose a PNG, JPEG or WebP image under 1 MB." }, { status: 400 });
  try {
    const blob = await put(`avatars/${user.id}/avatar.${type.extension}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: type.mime,
      cacheControlMaxAge: 3600,
    });
    const previous = avatarPath(user.id, user.image);
    if (previous) await del(previous).catch(() => undefined);
    return NextResponse.json({ image: `/api/avatar?path=${encodeURIComponent(blob.pathname)}` });
  } catch (error) {
    console.error("Avatar upload failed", error);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 400 });
  }
}

// Removes the stored file; the client then clears the user's image field.
export async function DELETE(request: Request) {
  if (unavailable()) return NextResponse.json({ ok: true });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const previous = avatarPath(user.id, user.image);
  if (previous) await del(previous).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  if (unavailable()) return new NextResponse(null, { status: 503 });
  const user = await currentUser();
  const path = new URL(request.url).searchParams.get("path");
  if (!user || !path || !path.startsWith(`avatars/${user.id}/`) || path.includes(".."))
    return new NextResponse(null, { status: 403 });
  const result = await get(path, { access: "private" });
  if (!result || result.statusCode !== 200) return new NextResponse(null, { status: 404 });
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
    },
  });
}
