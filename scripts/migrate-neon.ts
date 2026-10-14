import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL to your Neon pooled connection string.");

  const directory = path.join(process.cwd(), "neon", "migrations");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    await client.query(`
    create schema if not exists mypisara_meta;
    create table if not exists mypisara_meta.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
    const applied = new Set(
      (
        await client.query<{ name: string }>(
          "select name from mypisara_meta.schema_migrations",
        )
      ).rows.map((row) => row.name),
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(directory, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into mypisara_meta.schema_migrations (name) values ($1)",
          [file],
        );
        await client.query("commit");
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    console.log("Neon migrations are up to date.");
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
