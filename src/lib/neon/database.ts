import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var myPisaraNeonPool: Pool | undefined;
}

export const databaseConfigured = () =>
  Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);

export const pool =
  globalThis.myPisaraNeonPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://localhost/mypisara_build",
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalThis.myPisaraNeonPool = pool;

// Every board query runs as the restricted app role with the signed-in user as
// owner, so row-level security fails closed if the owner is missing.
export async function withOwner<T>(
  owner: string,
  run: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role mypisara_app");
    await client.query("select set_config('app.owner_id', $1, true)", [owner]);
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export const rows = <T>(value: QueryResultRow[]) =>
  JSON.parse(JSON.stringify(value)) as T[];
