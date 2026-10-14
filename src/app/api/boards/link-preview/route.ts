import { NextResponse } from "next/server";
import { configured, currentUser } from "@/lib/auth";
import { fetchLinkPreview, fetchOembed, oembedEndpoint, previewUrl } from "@/lib/board-link-preview";

export const runtime = "nodejs";
let activePreviews = 0;

// Previews are for signed-in users (or local demo mode without a database).
// The fetcher only connects to validated public addresses and bounds
// redirects, size and time.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const signedIn = !configured() || Boolean(await currentUser());
  let reserved = false;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "URL is too long." }, { status: 400 });
    const input = JSON.parse(raw);
    if (typeof input.url !== "string") throw new Error("Paste a website URL.");
    // Signed-out visitors may only look up video and music titles. Those requests go to fixed
    // provider hosts, so this can't be used to make the server fetch arbitrary pages.
    if (!signedIn) {
      if (!oembedEndpoint(previewUrl(input.url)))
        return NextResponse.json({ error: "Sign in to load previews." }, { status: 401 });
      if (activePreviews >= 6) return NextResponse.json({ error: "Preview service is busy. Try again shortly." }, { status: 429 });
      activePreviews++;
      reserved = true;
      const embedded = await fetchOembed(previewUrl(input.url), input.url);
      if (!embedded) return NextResponse.json({ error: "Preview unavailable. Your link is still saved." }, { status: 422 });
      return NextResponse.json(embedded, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (activePreviews >= 6) return NextResponse.json({ error: "Preview service is busy. Try again shortly." }, { status: 429 });
    activePreviews++;
    reserved = true;
    return NextResponse.json(await fetchLinkPreview(input.url), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Preview unavailable. Your link is still saved." }, { status: 422 });
  } finally {
    if (reserved) activePreviews--;
  }
}
