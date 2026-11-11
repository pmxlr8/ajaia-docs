# Architecture note

## What I decided to build

The brief is basically "Google Docs in 4 to 6 hours", which isn't realistic, so I picked three things and tried to do them properly instead of doing everything halfway:

1. An editor that feels solid: real rich text, structure that saves and loads exactly, and autosave you don't have to think about.
2. Sharing as an actual access model (owner, editor, viewer) that the server checks on every request, not just a flag in the UI.
3. No silent data loss when two people edit the same document.

File import was the fourth required piece. I kept it simple (a `.txt`, `.md` or `.docx` file becomes a new document), but I made sure it's safe and tested.

After I recorded the video I still had time, so I went back to the brief's stretch list and added version history with restore, live presence, Markdown and PDF export, and comments. They are described in their own section below.

## How it fits together

```
Browser (React, Tiptap)                 Next.js server (Vercel functions)            Postgres
───────────────────────                 ─────────────────────────────────            ────────
Dashboard ──GET /docs (server render)──▶ listDocuments(user) ───────────────────────▶ documents
Editor  ──PATCH /api/documents/:id ────▶ updateContent(user, id, json, baseVersion)  document_shares
        ──POST /api/documents/:id/presence (every 4 s: heartbeat + version + who's here) users
        ──GET/POST /api/documents/:id/versions[/:vid]  (history, preview, restore)  document_versions
        ──GET/POST/PATCH/DELETE /api/documents/:id/comments                         document_comments
Share   ──POST/DELETE /api/documents/:id/shares                                     document_presence
Import  ──POST /api/import (multipart) ─▶ file → HTML → editor JSON → createDocument
```

It's a single Next.js app for both the UI and the API. The route handlers are kept thin: they parse the input with Zod, get the user from the session, and call the document service. The service (`src/lib/documents.ts`) is the only code that touches documents, and every function in it takes the current user and checks their role first. I like this setup because it makes access control hard to skip by accident, and I could test it directly without going through HTTP.

## Main decisions

**Tiptap 3 and ProseMirror JSON.** Tiptap is a mature editor built on ProseMirror, and it has a proper schema. I store the content as ProseMirror JSON in a `jsonb` column instead of HTML, so the structure comes back exactly as it was saved. The catch is that the server also needs to know the schema, which leads to the next point.

**One schema for everything.** `lib/editor/extensions.ts` is used by the editor in the browser, by the server when it validates a save, and by the import code. The server rejects any JSON the editor can't render (unknown nodes, wrong nesting, or more than 1 MB). Imports go through the same schema, so scripts, styles, images and tables simply get dropped. The downside is that some formatting from imported files is lost, and the UI says so.

**Optimistic concurrency instead of real-time editing.** Each document has a `version` column, and saves use `UPDATE ... WHERE version = $base`. If someone else saved first, the server returns 409 with the latest copy, and the user picks "Load their version" or "Keep mine". Every open editor sends a small heartbeat every 4 seconds, and if it isn't typing it pulls in other people's changes. Without this, sharing would mean last-write-wins, and someone could lose work without knowing. It isn't real-time merging, though: if two people type at the same moment, one of them sees the conflict prompt.

**Postgres everywhere.** Production uses Neon. Locally and in tests I use PGlite, which is Postgres compiled to WebAssembly. That way the SQL is the same in every environment, reviewers can run `npm install && npm run dev` without installing a database, and the tests run against a real Postgres engine in memory. It adds about 10 MB to `node_modules`, which I think is a fair price.

**Plain SQL, no ORM.** There are only a handful of tables and the queries are short, so an ORM felt like more moving parts than it was worth in a timebox. The schema is created with idempotent `CREATE TABLE IF NOT EXISTS` statements instead of a migrations tool.

**Mocked auth with a signed cookie.** The brief allows mocked auth, so there are three seeded users and no passwords. The session cookie is httpOnly and signed with HMAC, so you can't just edit it to become someone else.

**404 when you don't have access.** I return 404 rather than 403, so the app doesn't confirm that a document id exists. The message in the UI covers both cases.

**Vercel and the Neon free tier.** Both are free for reviewers, no card is needed, and the database survives restarts. I thought about SQLite, but on a free host the disk usually gets wiped when the instance sleeps. Serverless also means no WebSockets, which is a big part of why I went with the concurrency approach above.

## Data model

```
users(id, email UNIQUE, name, color)
documents(id, owner_id → users, title, content JSONB, version, created_at, updated_at, updated_by → users)
document_shares(document_id → documents ON DELETE CASCADE, user_id → users, role 'viewer'|'editor', PK(document_id, user_id))
document_versions(id, document_id → documents ON DELETE CASCADE, version, title, content JSONB, kind 'baseline'|'edit'|'restore', created_by, created_at)
document_presence(document_id, user_id, last_seen, editing, PK(document_id, user_id))
document_comments(id, document_id → documents ON DELETE CASCADE, author_id, quote, body, resolved, created_at)
```

Working out someone's role is one query: they're the owner if `documents.owner_id` matches, otherwise it's their row in `document_shares`, otherwise they have no access. The permission rules live in `lib/access.ts` (`can.edit`, `can.share` and so on), so the UI and the server always agree.

## How saving works in the browser

- Typing marks the document as changed and schedules a save 800 ms later. Cmd/Ctrl+S saves right away.
- Only one save runs at a time. If you keep typing during a save, one follow-up save is queued with the latest content.
- On a 409, autosave pauses and the conflict banner shows up. On network errors or 5xx responses, it retries after 5 seconds. On 403 or 404 (for example, the owner removed your access), the editor switches to read-only.
- When you leave the page, it sends one last save with `keepalive`, and closing the tab with unsaved changes shows the browser's usual warning.

## Stretch features (added after the video)

**Version history.** Every save also writes a row to `document_versions`. If the same person saves again within 2 minutes, I update their last row instead of adding a new one, because autosave runs every second or so and nobody wants 300 versions of one paragraph. The first save also stores a "baseline" copy of the document as it was before, so you can always get back to the start. Restoring a version is just a normal save of the old content with the same `baseVersion` check, so it can't overwrite someone's newer work, and it shows up in the history as "Restored". Only editors and the owner can see history. Viewers can't, since history could show text the owner later removed.

**Live presence.** I replaced the old version poll with a heartbeat: `POST /presence` every 4 seconds records that you have the document open and whether you're typing, and it returns the latest version, everyone else seen in the last 15 seconds, and the open comment count. So it's still one small request per tab, but now the top bar can say "Bob is editing" with a dot that pulses while he types. It's polling, not WebSockets, so it can lag by a few seconds, and that's fine for presence.

**Export.** Markdown export runs in the browser. I wrote a small serializer from ProseMirror JSON (`lib/markdown.ts`) instead of converting HTML, because the JSON already has the exact structure. Underline has no Markdown syntax, so it becomes `<u>…</u>`. There's a test that exports a document and imports it again to check nothing structural is lost. PDF export uses the browser's print dialog with a print stylesheet that hides the app and keeps only the document. Generating PDFs on the server would need a headless browser, which is heavy for a serverless function.

**Comments.** Editors and the owner can comment, resolve and reopen. Viewers can read comments but not add them, which matches what "view only" means elsewhere in the app. The author or the owner can delete a comment. If you select text before opening Comments, the comment keeps that text as a quote, and clicking the quote selects it in the document again. I chose quotes over anchoring comments with an editor mark on purpose: a mark would live inside the document content, so adding a comment would change the document, bump its version and could cause conflicts with someone typing. The trade-off is that if the quoted text is edited later, the quote can't find it anymore. The comment itself stays.

## What I left out on purpose

- **Real-time co-editing (CRDT/Yjs) and live cursors.** It's the biggest Google Docs feature, but doing it well needs a stateful WebSocket server and probably a full day of work. Optimistic concurrency gets the correctness part right for now.
- **Real authentication.** The brief allows mocked auth, and real auth wouldn't change the access model.
- **Suggestion mode.** Tracking insertions and deletions as suggestions is a lot of editor work on its own, and it only becomes really useful together with real-time editing.
- **Images, tables and attachments.** Each of these needs file storage or more schema work. The import screen says clearly what gets dropped.

## If I had 2 to 4 more hours

1. Real-time collaboration with Yjs and the Tiptap Collaboration extension, using a hosted provider like Hocuspocus or Liveblocks, with live cursors on top of the presence I already have. I'd still keep the JSON snapshot in Postgres for the dashboard, history and search.
2. Comment replies and @mentions, and anchoring comments to positions that survive edits (this gets much easier with Yjs relative positions).
3. Importing into an existing document, and keeping images on import.
4. Real auth (Auth.js with email links) and invites for people who don't have an account yet.
5. A Playwright end-to-end test: share as Alice, edit as Bob, comment as Bob, check as Carol.
