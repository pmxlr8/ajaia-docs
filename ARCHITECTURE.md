# Architecture note

## The product slice I chose

The brief asks for a Google-Docs-like editor in 4–6 hours. I picked **depth in three places** instead of shallow coverage everywhere:

1. **An editor that feels solid**: real rich text, structure that round-trips exactly, autosave you can trust.
2. **Sharing that is a real access model**, not a flag: owner / editor / viewer, enforced on the server for every operation.
3. **No silent data loss when two people edit**: optimistic concurrency with a clear conflict choice.

File import is the fourth required area. I kept it simple (new document from `.txt`, `.md`, `.docx`) but made it safe and tested.

## System shape

```
Browser (React, Tiptap)                 Next.js server (Vercel functions)            Postgres
───────────────────────                 ─────────────────────────────────            ────────
Dashboard ──GET /docs (server render)──▶ listDocuments(user) ───────────────────────▶ documents
Editor  ──PATCH /api/documents/:id ────▶ updateContent(user, id, json, baseVersion)  document_shares
        ──GET  /api/documents/:id/version (every 4 s, cheap)                         users
Share   ──POST/DELETE /api/documents/:id/shares
Import  ──POST /api/import (multipart) ─▶ file → HTML → editor JSON → createDocument
```

One Next.js app holds UI and API. Route handlers are thin: parse with Zod, get the user from the session, call the document service. **The service layer (`src/lib/documents.ts`) is the only code that touches documents, and every function takes the acting user and checks the role first.** That makes access control hard to bypass and easy to test without HTTP.

## Key decisions

| Decision | Why | Cost |
| --- | --- | --- |
| **Tiptap 3 (ProseMirror)**, content stored as **ProseMirror JSON in `jsonb`** | Mature editor with a schema. JSON keeps exact structure (no HTML drift). | Need a schema on the server too (see next row). |
| **One shared schema** (`lib/editor/extensions.ts`) used by the browser editor, server validation and import | The server rejects any JSON the editor cannot render (unknown nodes, bad nesting, > 1 MB). Imports pass through the same schema, which drops scripts, styles, images and tables. | Formatting outside the schema is lost on import (documented). |
| **Optimistic concurrency** (`version` column, `UPDATE … WHERE version = $base`) | Without it, sharing means silent last-write-wins data loss. With it, a stale save gets **409 + the latest copy**, and the user picks *Load theirs* or *Keep mine*. Idle editors poll a tiny version endpoint and pull others' saves. | Not real-time merging. Two people typing at once see a conflict prompt. |
| **Postgres everywhere: Neon in prod, PGlite locally and in tests** | Same SQL dialect in every environment. Reviewers run `npm install && npm run dev` with no database install. Tests hit a real Postgres engine in memory. | PGlite adds ~10 MB to `node_modules`. |
| **Plain parameterized SQL**, no ORM | 3 tables; SQL is short and readable; fewer moving parts in a timebox. | No generated types or migrations tool. Schema is idempotent `CREATE IF NOT EXISTS`. |
| **Mocked auth**: seeded users, HMAC-signed httpOnly cookie | The brief allows mocked auth. Signing means the cookie cannot be edited to impersonate someone. | No passwords, no sign-up, no invites to unknown emails. |
| **404 for "no access"** (not 403) | Does not reveal which document ids exist. | Slightly less helpful message; the UI explains both cases. |
| **Next.js on Vercel + Neon free tier** | Free for reviewers, no card, managed Postgres that survives restarts. SQLite on a free host would lose data when the instance sleeps. | Serverless means no WebSockets, which shaped the concurrency choice above. |

## Data model

```
users(id, email UNIQUE, name, color)
documents(id, owner_id → users, title, content JSONB, version, created_at, updated_at, updated_by → users)
document_shares(document_id → documents ON DELETE CASCADE, user_id → users, role 'viewer'|'editor', PK(document_id, user_id))
```

Role resolution is one query: owner if `documents.owner_id = user`, else the row in `document_shares`, else no access. Permission rules live in `lib/access.ts` (`can.edit`, `can.share`, …) so UI and server agree.

## Save pipeline (client)

- Typing marks the doc dirty and schedules a save 800 ms later. `Cmd/Ctrl+S` saves now.
- Only one save is in flight. Edits during a save queue one follow-up save with the latest content.
- On 409, autosave pauses and the conflict banner appears. On network or 5xx errors, it retries after 5 s. On 403/404 (access revoked), the editor turns read-only.
- Leaving the page sends a final `keepalive` save; closing the tab with unsaved work shows the browser warning.

## What I cut, on purpose

- **Real-time co-editing (CRDT/Yjs) and live cursors.** Biggest Google Docs feature, but needs a stateful WebSocket server and a day of work to do well. Optimistic concurrency gives correctness now.
- **Real authentication.** Allowed by the brief; would not change the access model.
- **Comments, suggestions, version history, export.** Stretch items; I chose role-based permissions (editor vs viewer) as the one stretch item because it deepens the sharing model that is already core.
- **Images, tables, attachments.** Each needs storage or schema work; import states clearly what is dropped.

## Next 2–4 hours

1. **Real-time collaboration**: Yjs + Tiptap Collaboration extension with a hosted provider (e.g. Hocuspocus or Liveblocks), presence avatars. Keep the JSON snapshot in Postgres for listing and search.
2. **Version history**: store a snapshot row per N saves; a side panel to preview and restore.
3. **Export** to Markdown and PDF; **import into an existing document**.
4. **Real auth** (Auth.js email links) and invites for emails without an account.
5. **End-to-end test** (Playwright): share as Alice, edit as Bob, verify as Carol.
