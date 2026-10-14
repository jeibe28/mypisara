import { NextResponse } from "next/server";
import { z } from "zod";
import { configured, currentUser } from "@/lib/auth";
import { ACCENTS, SIZES, THEMES } from "@/lib/preferences";
import { storePreferences } from "@/lib/user-preferences";

const schema = z.object({
  theme: z.enum(THEMES),
  size: z.enum(SIZES),
  accent: z.enum(ACCENTS),
});

export async function PUT(request: Request) {
  if (!configured()) return NextResponse.json({ error: "Accounts aren't connected." }, { status: 503 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
  try {
    await storePreferences(user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Saving preferences failed", error);
    return NextResponse.json({ error: "Couldn't save preferences." }, { status: 503 });
  }
}
