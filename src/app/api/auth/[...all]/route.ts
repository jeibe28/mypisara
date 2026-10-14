import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth, configured } from "@/lib/auth";

const handler = toNextJsHandler(auth);

// Without a database and secret the app runs as a browser-only demo, so the
// sign-in endpoints stay closed instead of running against a placeholder.
const guarded =
  (run: (request: Request) => Promise<Response>) => async (request: Request) =>
    configured()
      ? run(request)
      : NextResponse.json({ error: "Accounts aren't connected." }, { status: 503 });

export const GET = guarded(handler.GET);
export const POST = guarded(handler.POST);
export const PATCH = guarded(handler.PATCH);
export const PUT = guarded(handler.PUT);
export const DELETE = guarded(handler.DELETE);
