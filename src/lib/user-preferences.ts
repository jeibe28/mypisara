import "server-only";
import { pool } from "./neon/database";
import { normalizePreferences, type Preferences } from "./preferences";

// Returns null when nothing is saved yet, or when the table isn't migrated, so
// the app keeps working from this device's saved settings.
export async function loadPreferences(userId: string): Promise<Preferences | null> {
  try {
    const result = await pool.query(
      "select theme, size, accent from user_preferences where user_id = $1",
      [userId],
    );
    return result.rowCount ? normalizePreferences(result.rows[0]) : null;
  } catch (error) {
    console.error("Preferences unavailable", error);
    return null;
  }
}

export async function storePreferences(userId: string, value: Preferences) {
  await pool.query(
    `insert into user_preferences (user_id, theme, size, accent) values ($1, $2, $3, $4)
     on conflict (user_id) do update
       set theme = excluded.theme, size = excluded.size, accent = excluded.accent, updated_at = now()`,
    [userId, value.theme, value.size, value.accent],
  );
}

export type BoardFolder = { id: string; name: string };
export type DashboardPreferences = {
  favorites: string[];
  sort: "recent" | "name" | "cards";
  layout: "grid" | "list";
  // Left undefined when the database has no folder columns yet, so the device's own copy is kept.
  folders?: BoardFolder[];
  // board id -> folder id. A board is in at most one folder.
  board_folders?: Record<string, string>;
};

// Favorites and dashboard layout. Null until migration 0005 is applied or the
// user has saved something, in which case the browser's own copy is used.
export async function loadDashboard(userId: string): Promise<DashboardPreferences | null> {
  try {
    // Folders arrive with migration 0008; until then the older columns still load.
    let result;
    let foldersSupported = true;
    try {
      result = await pool.query(
        "select favorites, board_sort, board_layout, folders, board_folders from user_preferences where user_id = $1",
        [userId],
      );
    } catch {
      foldersSupported = false;
      result = await pool.query(
        "select favorites, board_sort, board_layout from user_preferences where user_id = $1",
        [userId],
      );
    }
    if (!result.rowCount) return null;
    const row = result.rows[0];
    const folders: BoardFolder[] = Array.isArray(row.folders)
      ? row.folders.filter((item: unknown): item is BoardFolder =>
          !!item && typeof (item as BoardFolder).id === "string" && typeof (item as BoardFolder).name === "string")
      : [];
    const board_folders: Record<string, string> = {};
    if (row.board_folders && typeof row.board_folders === "object" && !Array.isArray(row.board_folders))
      for (const [board, folder] of Object.entries(row.board_folders as Record<string, unknown>))
        if (typeof folder === "string" && folders.some((item) => item.id === folder)) board_folders[board] = folder;
    return {
      favorites: Array.isArray(row.favorites) ? row.favorites.filter((id: unknown) => typeof id === "string") : [],
      sort: ["recent", "name", "cards"].includes(row.board_sort) ? row.board_sort : "recent",
      layout: ["grid", "list"].includes(row.board_layout) ? row.board_layout : "grid",
      ...(foldersSupported ? { folders, board_folders } : {}),
    };
  } catch {
    return null;
  }
}

// Returns whether folders were saved to the account (false until migration 0008 is applied).
export async function storeDashboard(userId: string, value: DashboardPreferences): Promise<{ folders: boolean }> {
  const folders = value.folders ?? [];
  const boardFolders = value.board_folders ?? {};
  try {
    await pool.query(
      `insert into user_preferences (user_id, favorites, board_sort, board_layout, folders, board_folders)
       values ($1, $2::jsonb, $3, $4, $5::jsonb, $6::jsonb)
       on conflict (user_id) do update
         set favorites = excluded.favorites, board_sort = excluded.board_sort,
             board_layout = excluded.board_layout, folders = excluded.folders,
             board_folders = excluded.board_folders, updated_at = now()`,
      [userId, JSON.stringify(value.favorites), value.sort, value.layout, JSON.stringify(folders), JSON.stringify(boardFolders)],
    );
    return { folders: true };
  } catch (error) {
    // Folder columns missing (migration 0008 not applied): still save the rest.
    if (!/column .* does not exist/i.test(String((error as Error)?.message))) throw error;
    await pool.query(
      `insert into user_preferences (user_id, favorites, board_sort, board_layout)
       values ($1, $2::jsonb, $3, $4)
       on conflict (user_id) do update
         set favorites = excluded.favorites, board_sort = excluded.board_sort,
             board_layout = excluded.board_layout, updated_at = now()`,
      [userId, JSON.stringify(value.favorites), value.sort, value.layout],
    );
    return { folders: false };
  }
}
