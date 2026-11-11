import type { Db } from "./db";
import { WELCOME_DOC } from "./seed-content";

/** Demo accounts. Auth is mocked: reviewers pick one of these on the sign-in page. */
export const SEED_USERS = [
  { id: "u_alice", email: "alice@ajaia.test", name: "Alice Chen", color: "#2563eb" },
  { id: "u_bob", email: "bob@ajaia.test", name: "Bob Okafor", color: "#059669" },
  { id: "u_carol", email: "carol@ajaia.test", name: "Carol Diaz", color: "#d97706" },
] as const;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
     id         TEXT PRIMARY KEY,
     email      TEXT NOT NULL UNIQUE,
     name       TEXT NOT NULL,
     color      TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id          TEXT PRIMARY KEY,
     owner_id    TEXT NOT NULL REFERENCES users(id),
     title       TEXT NOT NULL,
     content     JSONB NOT NULL,
     version     INTEGER NOT NULL DEFAULT 1,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_by  TEXT REFERENCES users(id)
   )`,
  `CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id)`,
  `CREATE TABLE IF NOT EXISTS document_shares (
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     user_id     TEXT NOT NULL REFERENCES users(id),
     role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS document_shares_user_idx ON document_shares(user_id)`,
];

export async function migrate(db: Db): Promise<void> {
  for (const sql of STATEMENTS) await db.query(sql);

  for (const u of SEED_USERS) {
    await db.query(
      `INSERT INTO users (id, email, name, color) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email, u.name, u.color],
    );
  }

  // One sample document so the sharing model is visible on first sign-in.
  if (process.env.SKIP_SEED_DOCS !== "1") {
    const inserted = await db.query(
      `INSERT INTO documents (id, owner_id, title, content, updated_by)
       VALUES ('welcome', 'u_alice', 'Welcome to Ajaia Docs', $1::jsonb, 'u_alice')
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [JSON.stringify(WELCOME_DOC)],
    );
    if (inserted.rows.length > 0) {
      await db.query(
        `INSERT INTO document_shares (document_id, user_id, role) VALUES
           ('welcome', 'u_bob', 'editor'), ('welcome', 'u_carol', 'viewer')
         ON CONFLICT DO NOTHING`,
      );
    }
  }
}
