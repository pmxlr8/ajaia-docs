# Ajaia Docs

A lightweight collaborative document editor: create, format, autosave, import files, and share documents with other people as editors or viewers.

- **Live app:** https://ajaia-docs-pranjal.vercel.app
- **Source:** https://github.com/pmxlr8/ajaia-docs
- **Stack:** Next.js 16 (App Router, TypeScript) · Tiptap 3 (ProseMirror) · Postgres (Neon in production, PGlite locally) · Tailwind CSS 4 · Vitest

## Demo accounts

Sign-in is mocked: pick a seeded user on the sign-in page. No passwords. Use **Switch user** (top right) to change accounts.

| User | Email | Seeded access to "Welcome to Ajaia Docs" |
| --- | --- | --- |
| Alice Chen | alice@ajaia.test | Owner |
| Bob Okafor | bob@ajaia.test | Editor |
| Carol Diaz | carol@ajaia.test | Viewer |

**Two-minute review path**

1. Sign in as **Alice**. Create a document, type, use the toolbar (bold, italic, underline, headings, lists). The status shows *Saving…* then *Saved*.
2. Click **Share**, add `bob@ajaia.test` as *Can edit* and `carol@ajaia.test` as *Can view*.
3. Switch to **Bob**: the document is under **Shared with me** with a *Can edit* badge. Edit it.
4. Switch to **Carol**: same document, read-only, with no toolbar.
5. On the dashboard, click **Import file** and upload a `.md`, `.txt` or `.docx` file. It opens as a new editable document.

Tip: open two browsers (or one normal + one private window) signed in as different users. Saves from one appear in the other within about 4 seconds.

## What works

| Area | Behavior |
| --- | --- |
| Documents | Create, rename (inline title), edit, delete (owner only), reopen. Autosave 0.8 s after typing stops; `Cmd/Ctrl+S` saves now; warning before closing a tab with unsaved changes. |
| Rich text | Bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quotes, code blocks, undo/redo, clear formatting. Stored as ProseMirror JSON, so structure round-trips exactly. |
| File import | `.txt`, `.md`, `.docx` up to 2 MB become a new document. Headings, bold/italic/underline and lists are kept. Images and tables are dropped (stated in the UI). |
| Sharing | Owner grants access by email as **editor** or **viewer**, changes roles, revokes access. Dashboard separates **My documents** and **Shared with me** with role badges. Non-members get a 404 (no existence leak). |
| Concurrent edits | Optimistic concurrency: each save sends the version it started from. A stale save gets HTTP 409 and the editor shows *Load their version* / *Keep mine*. Idle editors pull other people's saves automatically. |
| Validation | Request bodies validated with Zod; document JSON validated against the editor schema on the server; size limits on content (1 MB) and uploads (2 MB); clean JSON errors with codes. |

## Screenshots

| | |
| --- | --- |
| ![Dashboard](docs/screenshots/1-dashboard-shared-with-me.jpg) Bob's dashboard: shared docs with role badges | ![Editor](docs/screenshots/2-editor-owner.jpg) Owner editing with the toolbar |
| ![Share dialog](docs/screenshots/3-share-dialog.jpg) Share dialog: grant, change role, remove | ![Editor role](docs/screenshots/4-editor-as-editor.jpg) Bob editing a doc Alice shared |
| ![Viewer](docs/screenshots/5-viewer-read-only.jpg) Carol (viewer): read-only, no toolbar | ![Conflict](docs/screenshots/6-save-conflict.jpg) Stale save: choose a version |

## Run locally

Requirements: Node.js 20+ and npm. **No database install needed.**

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `DATABASE_URL`, the app uses [PGlite](https://pglite.dev) (Postgres compiled to WASM) and stores data in `./.data/pglite`. Tables and demo users are created on first request. Delete `.data/` to reset.

To use a real Postgres instead:

```bash
DATABASE_URL="postgres://user:pass@host:5432/db" npm run dev
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm test` | Vitest suite (in-memory PGlite, no setup) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build and server |

### Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | Postgres connection string. Unset = embedded PGlite. |
| `SESSION_SECRET` | Production | HMAC key for the session cookie. A dev default is used locally; production refuses to start without it. |
| `PGLITE_DIR` | No | PGlite data folder (default `.data/pglite`; tests use `memory://`). |

## Tests

```bash
npm test
```

15 tests in two files:

- `tests/documents.test.ts`: the access model and save path against a real (in-memory) Postgres: non-members cannot see a document; viewers cannot edit, rename or share; editors can save and the owner sees the change; dashboard split; role change and revoke; bad share requests; owner-only delete; **stale saves return 409 with the latest copy**; schema validation rejects unknown nodes; title validation.
- `tests/import.test.ts`: Markdown, plain text and a real Word file (`tests/fixtures/quarterly-review.docx`) convert to headings, marks and lists; raw HTML in Markdown is shown as text; unsupported, empty, oversized and corrupt files are rejected.

## Deployment

Vercel (Next.js) + Neon Postgres (free tier, added through the Vercel Marketplace, which injects `DATABASE_URL`). `SESSION_SECRET` is set in the Vercel project. Schema creation and seeding run automatically on the first request (`CREATE TABLE IF NOT EXISTS`, idempotent seeds).

```bash
vercel deploy --prod
```

## Project layout

```
src/
  app/
    login/            demo sign-in page (server actions in app/actions.ts)
    docs/             dashboard (My documents / Shared with me)
    docs/[id]/        editor page
    api/documents/    REST: list, create, get, rename/save, delete, version probe, shares
    api/import/       file upload -> new document
  components/         DocEditor (autosave, conflicts, polling), Toolbar, ShareDialog, dashboard actions
  lib/
    db.ts             pg or PGlite behind one query() interface
    migrate.ts        schema + seed users + welcome document
    documents.ts      document service: every function enforces access rules
    access.ts         role -> permission rules
    content.ts        server-side validation of editor JSON
    import.ts         .txt/.md/.docx -> HTML -> editor JSON
    session.ts        signed-cookie mocked auth
    editor/extensions.ts  the one Tiptap schema shared by client, server and import
tests/                Vitest suites + Word fixture
```

## Known limits and next steps

See [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning. In short:

- **Not real-time co-editing.** Two people typing at once get a conflict prompt, not a merge. Next step: Yjs CRDT over a WebSocket provider (needs a long-running server, not serverless).
- **Mocked auth.** No passwords or sign-up. Next step: real auth (e.g. Auth.js with email magic links) and invite-by-email for people without accounts.
- Import creates a new document only; no images, tables or attachments; no export yet.
- No version history, comments or presence avatars.
