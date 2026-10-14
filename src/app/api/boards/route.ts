import { NextResponse } from "next/server";
import { z } from "zod";
import { configured, currentUser } from "@/lib/auth";
import type { PoolClient } from "pg";
import { rows, withOwner } from "@/lib/neon/database";
import { boardPreview, boardSchema, validBoardImage, type Board, type BoardCard } from "@/lib/boards";

async function owner() {
  if (!configured()) return null;
  return (await currentUser())?.id ?? null;
}
// Board trash needs the deleted_at column from migration 0004. Until it is
// applied the API keeps working and deletes are permanent, as before.
let trashColumn: { present: boolean; checked: number } | null = null;
async function hasTrash(db: PoolClient) {
  if (trashColumn && (trashColumn.present || Date.now() - trashColumn.checked < 30_000))
    return trashColumn.present;
  const result = await db.query(
    "select 1 from information_schema.columns where table_name='boards' and column_name='deleted_at' limit 1",
  );
  trashColumn = { present: Boolean(result.rowCount), checked: Date.now() };
  return trashColumn.present;
}
function failure(error: unknown) {
  console.error("Boards request failed", error);
  return NextResponse.json(
    { error: "Unable to reach your boards. Check the connection and try again." },
    { status: 503 },
  );
}
function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function GET(request: Request) {
  try {
    const id = await owner();
    if (!id) return NextResponse.json({ error: "Sign in to see your boards." }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const boardId = params.get("id");
    if (boardId && !z.string().uuid().safeParse(boardId).success)
      return NextResponse.json({ error: "Invalid board ID" }, { status: 400 });
    if (params.get("trash")) {
      const trashed = await withOwner(id, async (db) => {
        if (!(await hasTrash(db))) return [];
        await db.query(
          "delete from boards where owner_id=$1 and deleted_at < now() - interval '30 days'",
          [id],
        );
        return (
          await db.query(
            `select id, title, revision, deleted_at, updated_at, jsonb_array_length(cards) as card_count, cards
             from boards where owner_id=$1 and deleted_at is not null order by deleted_at desc`,
            [id],
          )
        ).rows;
      });
      // Send a small thumbnail description, not the whole board, so the trash list can show what each board held.
      const withPreview = (rows(trashed) as ({ cards?: unknown } & Record<string, unknown>)[]).map(({ cards, ...rest }) => ({
        ...rest,
        preview: Array.isArray(cards) ? boardPreview(cards as BoardCard[]) : [],
      }));
      return NextResponse.json(withPreview, { headers: { "Cache-Control": "private, no-store" } });
    }
    const result = await withOwner(id, async (db) => {
      const live = (await hasTrash(db)) ? " and deleted_at is null" : "";
      return boardId
        ? db.query(
            `select id, title, background, cards, trash, scene_order, revision, updated_at from boards where owner_id=$1 and id=$2${live}`,
            [id, boardId],
          )
        : db.query(
            `select id, title, revision, updated_at, jsonb_array_length(cards) as card_count,
              (select coalesce(jsonb_agg(jsonb_build_object(
                  'kind', e.value->'kind', 'x', e.value->'x', 'y', e.value->'y',
                  'width', e.value->'width', 'height', e.value->'height',
                  'background_color', e.value->'background_color',
                  'color_value', e.value->'color_value', 'parent_id', e.value->'parent_id')
                order by e.idx), '[]'::jsonb)
               from jsonb_array_elements(cards) with ordinality as e(value, idx)
               where e.idx <= 80 and e.value->>'kind' <> 'line') as preview
             from boards where owner_id=$1${live} order by updated_at desc`,
            [id],
          );
    });
    if (boardId && !result.rowCount)
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    return NextResponse.json(boardId ? rows<Board>(result.rows)[0] : rows(result.rows), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const id = await owner();
    if (!id) return NextResponse.json({ error: "Sign in to save boards." }, { status: 401 });
    const raw = await request.text();
    if (raw.length > 2_000_000)
      return NextResponse.json({ error: "Board is too large." }, { status: 413 });
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = boardSchema.safeParse(input);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const b = parsed.data;
    if ([...b.cards, ...b.trash].some((c) => !validBoardImage(c.image, id)))
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
    const values = [
      b.id,
      id,
      b.title,
      JSON.stringify(b.cards),
      JSON.stringify(b.scene_order),
      JSON.stringify(b.trash),
      b.background,
    ];
    const saved = await withOwner(id, async (db) => {
      const result =
        b.revision === 0
          ? await db.query(
              "insert into boards(id,owner_id,title,cards,scene_order,trash,background) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning revision,updated_at",
              values,
            )
          : await db.query(
              "update boards set title=$3,cards=$4,scene_order=$5,trash=$6,background=$7,revision=revision+1,updated_at=now() where id=$1 and owner_id=$2 and revision=$8 returning revision,updated_at",
              [...values, b.revision],
            );
      return result.rows[0] ?? null;
    });
    if (!saved)
      return NextResponse.json(
        { error: "This board changed in another tab. Download your draft before loading the latest version." },
        { status: 409 },
      );
    return NextResponse.json(rows([saved])[0]);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const id = await owner();
    if (!id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const input = z
      .object({
        id: z.string().uuid(),
        revision: z.number().int().positive(),
        permanent: z.boolean().optional(),
      })
      .safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Invalid board" }, { status: 400 });
    const { id: boardId, revision, permanent } = input.data;
    const result = await withOwner(id, async (db) => {
      const trash = await hasTrash(db);
      // Without the trash column, or when emptying the trash, the row is removed.
      if (!trash || permanent)
        return db.query(
          `delete from boards where id=$1 and owner_id=$2 and revision=$3${trash ? " and deleted_at is not null" : ""}`,
          [boardId, id, revision],
        );
      return db.query(
        "update boards set deleted_at=now() where id=$1 and owner_id=$2 and revision=$3 and deleted_at is null",
        [boardId, id, revision],
      );
    });
    return result.rowCount
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Board changed. Reload before deleting." }, { status: 409 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const id = await owner();
    if (!id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const input = z
      .object({ id: z.string().uuid(), action: z.literal("restore") })
      .safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Invalid board" }, { status: 400 });
    const result = await withOwner(id, async (db) =>
      (await hasTrash(db))
        ? db.query(
            "update boards set deleted_at=null, updated_at=now() where id=$1 and owner_id=$2 and deleted_at is not null",
            [input.data.id, id],
          )
        : { rowCount: 0 },
    );
    return result.rowCount
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "That board is no longer in the trash." }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
