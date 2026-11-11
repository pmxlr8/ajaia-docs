# Ajaia Docs

A small collaborative document editor I built for the Ajaia take-home. You can create and format documents, they save automatically, you can import a file as a new document, and you can share a document with other people as an editor or a viewer. After the core was done I also added version history, live presence, comments and export to Markdown and PDF.

- **Live app:** https://ajaia-docs-pranjal.vercel.app
- **Code:** https://github.com/pmxlr8/ajaia-docs
- **Stack:** Next.js 16 (App Router, TypeScript), Tiptap 3 (ProseMirror), Postgres (Neon in production, PGlite locally), Tailwind CSS 4, Vitest

## Demo accounts

Sign-in is mocked, so there are no passwords. Just pick one of the seeded users on the sign-in page. You can use **Switch user** in the top right to change accounts.

| User | Email | Role on "Welcome to Ajaia Docs" |
| --- | --- | --- |
| Alice Chen | alice@ajaia.test | Owner |
| Bob Okafor | bob@ajaia.test | Editor |
| Carol Diaz | carol@ajaia.test | Viewer |

### A quick way to review it (about 2 minutes)

1. Sign in as **Alice**. Create a document and type something. Try the toolbar (bold, italic, underline, headings, lists). The status in the top bar goes from "Saving…" to "Saved".
2. Click **Share**. Add `bob@ajaia.test` with "Can edit" and `carol@ajaia.test` with "Can view".
3. Switch to **Bob**. The document shows up under "Shared with me" with a "Can edit" badge, and he can edit it.
4. Switch to **Carol**. She sees the same document, but it's read-only and there's no toolbar.
5. Back on the dashboard, click **Import file** and pick a `.md`, `.txt` or `.docx` file. It opens as a new document you can edit.
6. In any document, select some text and click **Comments** to comment on it. Click **History** to see earlier versions and restore one, and **Export** to download Markdown or save a PDF.

If you want to see two people at once, open a normal window and a private window and sign in as different users. Saves from one window show up in the other within about 4 seconds, and the top bar shows who else is in the document and whether they are typing.

## What works

| Area | What it does |
| --- | --- |
| Documents | Create, rename (click the title), edit, delete (owner only) and reopen. Autosave runs 0.8 s after you stop typing, Cmd/Ctrl+S saves right away, and the browser warns you if you close the tab with unsaved changes. |
| Rich text | Bold, italic, underline, strikethrough, H1 to H3, bulleted and numbered lists, quotes, code blocks, undo/redo and clear formatting. Content is saved as ProseMirror JSON, so the structure comes back exactly the same. |
| File import | `.txt`, `.md` and `.docx` files up to 2 MB become a new document. Headings, bold/italic/underline and lists are kept. Images and tables are dropped, and the UI says so. |
| Sharing | The owner adds people by email as an editor or a viewer, and can change their role or remove them. The dashboard has separate "My documents" and "Shared with me" sections. If you don't have access, you get a 404, so the app doesn't reveal which documents exist. |
| Editing at the same time | Every save sends the version it started from. If someone else saved in between, the server returns 409 and the editor asks you to either load their version or keep yours. If you aren't typing, other people's saves are pulled in automatically. |
| Version history | Every save is kept, with quick saves by one person grouped into one version. Editors and the owner can preview any version and restore it. A restore is a normal save, so it can't overwrite someone's newer work. |
| Presence | The top bar shows who else has the document open, and says "Bob is editing" while someone types. |
| Comments | Select text and comment on it. Editors and the owner can comment, resolve and reopen; viewers can read. Clicking a quote selects that text in the document again. The button shows how many comments are open. |
| Export | Markdown download (built from the document JSON, so headings, lists, marks and code blocks come out right) and PDF through the browser's print dialog, with a print stylesheet that keeps only the document. |
| Validation | Request bodies are checked with Zod, and the document JSON is checked against the editor schema on the server. Content is capped at 1 MB and uploads at 2 MB. Errors come back as clean JSON with an error code. |

## Screenshots

| | |
| --- | --- |
| ![Dashboard](docs/screenshots/1-dashboard-shared-with-me.jpg) Bob's dashboard, with documents shared with him and his access | ![Editor](docs/screenshots/2-editor-owner.jpg) Alice editing her own document |
| ![Share dialog](docs/screenshots/3-share-dialog.jpg) The share dialog: add people, change roles, remove access | ![Editor role](docs/screenshots/4-editor-as-editor.jpg) Bob editing a document Alice shared with him |
| ![Viewer](docs/screenshots/5-viewer-read-only.jpg) Carol as a viewer: read-only, no toolbar | ![Conflict](docs/screenshots/6-save-conflict.jpg) A stale save: pick which version to keep |
| ![Comments and presence](docs/screenshots/7-comments-and-presence.jpg) Comments on selected text, and "Bob is editing" in the top bar | ![Version history](docs/screenshots/8-version-history.jpg) Version history: preview an earlier version and restore it |

## Running it locally

You only need Node.js 20+ and npm. You don't have to install a database.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. If `DATABASE_URL` isn't set, the app uses [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) and keeps the data in `./.data/pglite`. The tables and demo users are created on the first request. To start fresh, just delete `.data/`.

If you'd rather use a real Postgres:

```bash
DATABASE_URL="postgres://user:pass@host:5432/db" npm run dev
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm test` | Vitest suite (uses in-memory PGlite, no setup needed) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build and server |

### Environment variables

| Name | Required? | What it's for |
| --- | --- | --- |
| `DATABASE_URL` | In production | Postgres connection string. If it's not set, the app uses embedded PGlite. |
| `SESSION_SECRET` | In production | HMAC key for the session cookie. There's a default for local dev, but production won't start without it. |
| `PGLITE_DIR` | No | Where PGlite keeps its data (default `.data/pglite`; the tests use `memory://`). |

## Tests

```bash
npm test
```

There are 25 tests in three files:

- `tests/documents.test.ts` runs the access rules and the save path against a real Postgres (in memory). It checks that people without access can't see a document; that viewers can't edit, rename or share; that an editor's save shows up for the owner; the dashboard split; changing and removing roles; bad share requests; owner-only delete; that **a stale save gets a 409 with the latest copy**; that the schema rejects unknown nodes; and title validation.
- The same file also covers the stretch features: presence (who shows up and when they drop off), version history (merging quick saves, restore with the 409 check, viewers and other documents blocked) and comments (who can add, resolve and delete, and that comments can't be reached through another document).
- `tests/markdown.test.ts` checks the Markdown export: structure and marks, escaping, a round trip through the Markdown importer, and file names.
- `tests/import.test.ts` checks that Markdown, plain text and a real Word file (`tests/fixtures/quarterly-review.docx`) turn into proper headings, marks and lists; that raw HTML in Markdown shows up as plain text; and that unsupported, empty, too-large and broken files are rejected.

## Deployment

The app runs on Vercel with a free Neon Postgres database, which I added through the Vercel Marketplace (it sets `DATABASE_URL` for you). `SESSION_SECRET` is set in the Vercel project settings. The schema and seed data are created on the first request, and both steps are safe to run more than once.

```bash
vercel deploy --prod
```

## Project layout

```
src/
  app/
    login/            demo sign-in page (server actions are in app/actions.ts)
    docs/             dashboard (My documents / Shared with me)
    docs/[id]/        editor page
    api/documents/    REST: list, create, get, rename/save, delete, shares, presence, versions, comments
    api/import/       file upload -> new document
  components/         DocEditor (autosave, conflicts, presence, history, comments, export), Toolbar, ShareDialog, Dashboard
  lib/
    db.ts             pg or PGlite behind one query() function
    migrate.ts        schema, seed users and the welcome document
    documents.ts      document service: every function checks access first
    access.ts         role -> permission rules
    content.ts        server-side validation of editor JSON
    import.ts         .txt/.md/.docx -> HTML -> editor JSON
    markdown.ts       editor JSON -> Markdown for export
    session.ts        signed-cookie mocked auth
    editor/extensions.ts  the one Tiptap schema shared by the client, the server and import
tests/                Vitest suites and a Word test file
```

## Known limits and next steps

The reasoning behind these is in [ARCHITECTURE.md](ARCHITECTURE.md). The short version:

- **It's not real-time co-editing.** If two people type at the same moment, one of them gets a conflict prompt instead of a merge. The next step would be Yjs (a CRDT) over a WebSocket provider, which needs a long-running server rather than serverless functions.
- **Auth is mocked.** There are no passwords and no sign-up. Next I'd add real auth (for example Auth.js with email magic links) and invites for people who don't have an account yet.
- Import only creates a new document. Images, tables and attachments aren't supported.
- Comments are flat (no replies) and are linked to text by a quote, so if that text is edited later the quote can't be found anymore. There's no suggestion mode.
- Presence and remote changes come from polling every 4 seconds, so they can lag a little.
