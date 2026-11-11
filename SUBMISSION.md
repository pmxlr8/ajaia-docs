# Submission: Ajaia Docs

**Candidate:** Pranjal Mishra (pm4084@nyu.edu)
**Role:** AI-Native Full Stack Product Engineer

## Links

- **Live app:** https://ajaia-docs.vercel.app
- **Source (GitHub):** https://github.com/pmxlr8/ajaia-docs
- **Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts

Sign-in is mocked. On the sign-in page, click a user. No passwords.

| User | Email | Access to the seeded "Welcome to Ajaia Docs" |
| --- | --- | --- |
| Alice Chen | alice@ajaia.test | Owner |
| Bob Okafor | bob@ajaia.test | Editor |
| Carol Diaz | carol@ajaia.test | Viewer |

Use **Switch user** (top right) to move between accounts, or use two browser windows.

## What is in this folder

| File / folder | Contents |
| --- | --- |
| `README.md` | Features, local setup and run instructions, scripts, env vars, tests, deployment |
| `ARCHITECTURE.md` | Architecture note: what I prioritized and why, key decisions, cuts, next steps |
| `AI_WORKFLOW.md` | AI tools used, where they helped, what I changed or rejected, how I verified |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Walkthrough video link |
| `src/` | Application source (Next.js app, API routes, components, document service) |
| `tests/` | Vitest suites and a Word `.docx` fixture |
| `docs/screenshots/` | Screenshots of the main screens |
| `package.json`, `package-lock.json`, config files | Build, lint, test and framework config |

`node_modules/`, `.next/` and local database files are not included. Run `npm install` to restore dependencies.

## Status

**Working end to end**

- Create, rename, edit, delete and reopen documents; autosave with status; `Cmd/Ctrl+S`
- Rich text: bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quotes, code blocks
- Import `.txt`, `.md`, `.docx` (max 2 MB) into a new document
- Sharing by email with **editor** or **viewer** roles; change role; revoke; owned vs shared sections and role badges
- Persistence in Postgres; formatting stored as structured JSON
- Conflict detection between collaborators (409 + choose a version); idle editors pick up others' saves within ~4 s
- Server-side validation and clean JSON errors; 15 automated tests

**Partial or not included (by choice)**

- Not real-time co-editing: simultaneous typing produces a conflict prompt, not a merge
- Auth is mocked (seeded users, signed cookie); no sign-up or invites to unknown emails
- Import does not keep images or tables; no export; no comments or version history

**Next 2–4 hours**

1. Real-time collaboration with Yjs and presence avatars
2. Version history with restore
3. Export to Markdown/PDF and import into an existing document
4. Real auth and email invites
5. Playwright end-to-end test of the three-user sharing flow
