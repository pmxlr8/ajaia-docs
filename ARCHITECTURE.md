# Architecture note

## What I decided to build

The brief is basically "Google Docs in 4 to 6 hours", which isn't realistic, so I picked three things and tried to do them properly instead of doing everything halfway:

1. An editor that feels solid: real rich text, structure that saves and loads exactly, and autosave you don't have to think about.
2. Sharing as an actual access model (owner, editor, viewer) that the server checks on every request, not just a flag in the UI.
3. No silent data loss when two people edit the same document.

File import was the fourth required piece. I kept it simple (a `.txt`, `.md` or `.docx` file becomes a new document), but I made sure it's safe and tested.

## How it fits together

```
Browser (React, Tiptap)                 Next.js server (Vercel functions)            Postgres
───────────────────────                 ─────────────────────────────────            ────────
Dashboard ──GET /docs (server render)──▶ listDocuments(user) ───────────────────────▶ documents
Editor  ──PATCH /api/documents/:id ────▶ updateContent(user, id, json, baseVersion)  document_shares
        ──GET  /api/documents/:id/version (every 4 s, cheap)                         users
Share   ──POST/DELETE /api/documents/:id/shares
Import  ──POST /api/import (multipart) ─▶ file → HTML → editor JSON → createDocument
```

It's a single Next.js app for both the UI and the API. The route handlers are kept thin: they parse the input with Zod, get the user from the session, and call the document service. The service (`src/lib/documents.ts`) is the only code that touches documents, and every function in it takes the current user and checks their role first. I like this setup because it makes access control hard to skip by accident, and I could test it directly without going through HTTP.

## Main decisions

**Tiptap 3 and ProseMirror JSON.** Tiptap is a mature editor built on ProseMirror, and it has a proper schema. I store the content as ProseMirror JSON in a `jsonb` column instead of HTML, so the structure comes back exactly as it was saved. The catch is that the server also needs to know the schema, which leads to the next point.

**One schema for everything.** `lib/editor/extensions.ts` is used by the editor in the browser, by the server when it validates a save, and by the import code. The server rejects any JSON the editor can't render (unknown nodes, wrong nesting, or more than 1 MB). Imports go through the same schema, so scripts, styles, images and tables simply get dropped. The downside is that some formatting from imported files is lost, and the UI says so.

**Optimistic concurrency instead of real-time editing.** Each document has a `version` column, and saves use `UPDATE ... WHERE version = $base`. If someone else saved first, the server returns 409 with the latest copy, and the user picks "Load their version" or "Keep mine". Editors that aren't typing poll a small version endpoint every 4 seconds and pull in other people's changes. Without this, sharing would mean last-write-wins, and someone could lose work without knowing. It isn't real-time merging, though: if two people type at the same moment, one of them sees the conflict prompt.

**Postgres everywhere.** Production uses Neon. Locally and in tests I use PGlite, which is Postgres compiled to WebAssembly. That way the SQL is the same in every environment, reviewers can run `npm install && npm run dev` without installing a database, and the tests run against a real Postgres engine in memory. It adds about 10 MB to `node_modules`, which I think is a fair price.

**Plain SQL, no ORM.** There are only three tables and the queries are short, so an ORM felt like more moving parts than it was worth in a timebox. The schema is created with idempotent `CREATE TABLE IF NOT EXISTS` statements instead of a migrations tool.

**Mocked auth with a signed cookie.** The brief allows mocked auth, so there are three seeded users and no passwords. The session cookie is httpOnly and signed with HMAC, so you can't just edit it to become someone else.

**404 when you don't have access.** I return 404 rather than 403, so the app doesn't confirm that a document id exists. The message in the UI covers both cases.

**Vercel and the Neon free tier.** Both are free for reviewers, no card is needed, and the database survives restarts. I thought about SQLite, but on a free host the disk usually gets wiped when the instance sleeps. Serverless also means no WebSockets, which is a big part of why I went with the concurrency approach above.

## Data model

```
users(id, email UNIQUE, name, color)
documents(id, owner_id → users, title, content JSONB, version, created_at, updated_at, updated_by → users)
document_shares(document_id → documents ON DELETE CASCADE, user_id → users, role 'viewer'|'editor', PK(document_id, user_id))
```

Working out someone's role is one query: they're the owner if `documents.owner_id` matches, otherwise it's their row in `document_shares`, otherwise they have no access. The permission rules live in `lib/access.ts` (`can.edit`, `can.share` and so on), so the UI and the server always agree.

## How saving works in the browser

- Typing marks the document as changed and schedules a save 800 ms later. Cmd/Ctrl+S saves right away.
- Only one save runs at a time. If you keep typing during a save, one follow-up save is queued with the latest content.
- On a 409, autosave pauses and the conflict banner shows up. On network errors or 5xx responses, it retries after 5 seconds. On 403 or 404 (for example, the owner removed your access), the editor switches to read-only.
- When you leave the page, it sends one last save with `keepalive`, and closing the tab with unsaved changes shows the browser's usual warning.

## What I left out on purpose

- **Real-time co-editing (CRDT/Yjs) and live cursors.** It's the biggest Google Docs feature, but doing it well needs a stateful WebSocket server and probably a full day of work. Optimistic concurrency gets the correctness part right for now.
- **Real authentication.** The brief allows mocked auth, and real auth wouldn't change the access model.
- **Comments, suggestions, version history and export.** These were all stretch ideas. For my one stretch item I picked editor vs viewer roles, because it builds on sharing, which was already core.
- **Images, tables and attachments.** Each of these needs file storage or more schema work. The import screen says clearly what gets dropped.

## If I had 2 to 4 more hours

1. Real-time collaboration with Yjs and the Tiptap Collaboration extension, using a hosted provider like Hocuspocus or Liveblocks, plus live presence. I'd still keep the JSON snapshot in Postgres for the dashboard and search.
2. Version history: store a snapshot every few saves, with a side panel to preview and restore them.
3. Export to Markdown and PDF, and importing into an existing document.
4. Real auth (Auth.js with email links) and invites for people who don't have an account yet.
5. A Playwright end-to-end test: share as Alice, edit as Bob, check as Carol.
