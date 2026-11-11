/**
 * Tiny database layer.
 *
 * - Production: real Postgres via `pg` when DATABASE_URL is set (Neon on Vercel).
 * - Local dev and tests: PGlite, an embedded WASM build of Postgres. Same SQL
 *   dialect, zero install. Data lives in ./.data/pglite (or memory:// in tests).
 *
 * Both drivers expose `query(sql, params) -> { rows }` with $1 placeholders,
 * so the rest of the app writes plain parameterized SQL against one interface.
 */
import { migrate } from "./migrate";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const globalForDb = globalThis as unknown as { __ajaiaDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 5 });
    return {
      query: async <T,>(sql: string, params?: unknown[]) => {
        const res = await pool.query(sql, params as unknown[]);
        return { rows: res.rows as T[] };
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  if (!dir.startsWith("memory://")) {
    const fs = await import("node:fs");
    fs.mkdirSync(dir, { recursive: true });
  }
  const pg = new PGlite(dir);
  return {
    query: async <T,>(sql: string, params?: unknown[]) => {
      const res = await pg.query<T>(sql, params);
      return { rows: res.rows };
    },
  };
}

async function init(): Promise<Db> {
  const db = await connect();
  try {
    await migrate(db);
  } catch (err) {
    // Two cold-starting serverless instances can race on CREATE TABLE IF NOT EXISTS.
    // The second one fails on a catalog unique index; retrying once is enough.
    await new Promise((r) => setTimeout(r, 250));
    await migrate(db).catch(() => {
      throw err;
    });
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__ajaiaDb) {
    globalForDb.__ajaiaDb = init().catch((err) => {
      globalForDb.__ajaiaDb = undefined; // let the next request retry
      throw err;
    });
  }
  return globalForDb.__ajaiaDb;
}

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = await getDb();
  const { rows } = await db.query<T>(sql, params);
  return rows;
}
