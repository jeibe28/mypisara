import { NextResponse } from "next/server";
import { z } from "zod";
import { configured, currentUser } from "@/lib/auth";
import { storeDashboard } from "@/lib/user-preferences";

const schema = z.object({
  favorites: z.array(z.string().uuid()).max(500),
  sort: z.enum(["recent", "name", "cards"]),
  layout: z.enum(["grid", "list"]),
  folders: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60) })).max(100).default([]),
  board_folders: z.record(z.string().uuid(), z.string().uuid()).default({}),
}).refine((value) => Object.keys(value.board_folders).length <= 2000, "Too many folder assignments");

export async function PUT(request: Request) {
  if (!configured()) return NextResponse.json({ error: "Accounts aren't connected." }, { status: 503 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
  try {
    const folders = parsed.data.folders.filter((folder, index, all) => all.findIndex((item) => item.id === folder.id) === index);
    // Only keep assignments that point at a folder that exists.
    const board_folders = Object.fromEntries(
      Object.entries(parsed.data.board_folders).filter(([, folder]) => folders.some((item) => item.id === folder)),
    );
    const stored = await storeDashboard(user.id, { ...parsed.data, favorites: [...new Set(parsed.data.favorites)], folders, board_folders });
    // folders_saved is false while the database hasn't been updated; the browser keeps its own copy meanwhile.
    return NextResponse.json({ ok: true, folders_saved: stored.folders });
  } catch (error) {
    console.error("Saving dashboard preferences failed", error);
    return NextResponse.json({ error: "Couldn't save." }, { status: 503 });
  }
}
