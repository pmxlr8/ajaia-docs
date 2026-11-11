# Submission: Ajaia Docs

**Candidate:** Pranjal Mishra (pm4084@nyu.edu)
**Role:** AI-Native Full Stack Product Engineer

## Links

- **Live app:** https://ajaia-docs-pranjal.vercel.app
- **Code on GitHub:** https://github.com/pmxlr8/ajaia-docs
- **Walkthrough video:** the link is in `VIDEO_URL.txt`

**Note:** I recorded the video first and then used the remaining time to build the stretch features from the brief: version history with restore, live presence, comments, and export to Markdown and PDF. They're live on the same link and covered by tests, but they aren't in the video. The quick review steps in the README include them.

## Test accounts

Sign-in is mocked, so there are no passwords. Just click a user on the sign-in page.

| User | Email | Role on the seeded "Welcome to Ajaia Docs" |
| --- | --- | --- |
| Alice Chen | alice@ajaia.test | Owner |
| Bob Okafor | bob@ajaia.test | Editor |
| Carol Diaz | carol@ajaia.test | Viewer |

You can change accounts with **Switch user** in the top right. To be two people at once, use a normal window and a private window.

## What's in this folder

| File or folder | What it is |
| --- | --- |
| `README.md` | Features, how to run it locally, scripts, environment variables, tests and deployment |
| `ARCHITECTURE.md` | The architecture note: what I prioritized and why, the main decisions, what I cut, and what's next |
| `AI_WORKFLOW.md` | Which AI tools I used, where they helped, what I changed or rejected, and how I checked the work |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Link to the walkthrough video |
| `src/` | The app itself (Next.js pages, API routes, components and the document service) |
| `tests/` | Vitest test suites and a Word `.docx` test file |
| `docs/screenshots/` | Screenshots of the main screens |
| `package.json`, `package-lock.json` and config files | Build, lint, test and framework config |

I didn't include `node_modules/`, `.next/` or the local database files. Run `npm install` to get the dependencies back.

## Status

### Working end to end

- Creating, renaming, editing, deleting and reopening documents, with autosave, a save status, and Cmd/Ctrl+S
- Rich text: bold, italic, underline, strikethrough, H1 to H3, bulleted and numbered lists, quotes and code blocks
- Importing `.txt`, `.md` and `.docx` files (up to 2 MB) as a new document
- Sharing by email as an editor or a viewer, changing roles and removing people, with separate "My documents" and "Shared with me" sections
- Everything is stored in Postgres, and formatting is saved as structured JSON
- Conflict handling between collaborators (a 409, then you choose which version to keep), and editors that aren't typing pick up other people's saves within about 4 seconds
- Server-side validation, clean JSON errors, and 25 automated tests

### Stretch features (added after the video)

- Version history: previews of earlier versions and one-click restore, with quick saves grouped per person
- Live presence: who else has the document open, and who is typing
- Comments on selected text, with resolve, reopen and delete; viewers can read them
- Export to Markdown and to PDF (print)
- Role-based permissions (owner, editor, viewer) were already part of the core

### Partial, or left out on purpose

- It isn't real-time co-editing. If two people type at the same moment, one of them gets a conflict prompt instead of a merge.
- Auth is mocked (seeded users and a signed cookie). There's no sign-up, and you can't invite emails that don't have an account.
- Import doesn't keep images or tables.
- Comments have no replies, and there's no suggestion mode.

### What I'd do with 2 to 4 more hours

1. Real-time collaboration with Yjs, with live cursors on top of the presence I already have
2. Comment replies, @mentions and suggestion mode
3. Importing into an existing document, and keeping images on import
4. Real auth and email invites
5. A Playwright end-to-end test of the three-user sharing flow
