# AI workflow note

## Tools

- **Claude Code (Claude Opus 5.5)** in the Claude desktop app: my main pair programmer. It wrote most of the code from my plan, ran the test suite, typechecked, and drove a built-in browser against the dev server to check the UI.
- **Next.js bundled docs** (`node_modules/next/dist/docs`) and the Tiptap type definitions as the source of truth for APIs. Next 16 and Tiptap 3 changed APIs that models often remember wrong, so the agent read these before writing code.

## Where AI materially sped things up

- **Scaffolding and boilerplate**: route handlers, Zod schemas, the Tailwind UI, and the share dialog came together in minutes, not hours.
- **Test writing**: the access-control and conflict tests were drafted quickly and passed against a real in-memory Postgres on the first run.
- **API lookups**: checking Tiptap 3 signatures (`setContent` options, `useEditorState`, the server `generateJSON`) by reading the installed type files instead of guessing.
- **Browser verification**: the agent signed in as each demo user, typed, reloaded, opened the share dialog, and forced a save conflict, then reported what it saw with screenshots.

## What I changed or rejected

| AI output or default | What I did | Why |
| --- | --- | --- |
| The Next 16 starter enabled **Cache Components + partial prefetching** | Turned it off | Every page reads the session cookie, so a prerendered shell adds complexity for no gain. It also keeps old routes mounted, which is risky for an editor with autosave timers. |
| Real-time co-editing with **Yjs/WebSockets** was an option | Rejected for this timebox | Needs a stateful server (Vercel functions cannot hold sockets) and much more testing. Chose optimistic concurrency + polling: correct, simple, and honest about its limits. |
| **SQLite on a free host** (simplest storage) | Rejected | Free hosts have ephemeral disks, so data would vanish when the instance sleeps. Used Neon Postgres in production and PGlite (same dialect) locally. |
| First version of the DB layer | Fixed a crash | PGlite failed on first run because its parent folder did not exist. Found in the first browser check; fixed with a recursive `mkdir`. |
| Relative-time component | Fixed a hydration error | The tooltip used locale formatting during server render and did not match the browser. Found in the browser console; moved it to client-only state. |
| First `.docx` check used a file made by macOS `textutil` | Replaced with a real Word fixture | That file had fake bullets and no heading styles, so it could not prove heading and list mapping. Built a proper `.docx` with python-docx and added it to the test suite. |
| Pressing Enter in the title moved focus with `editor.commands.focus()` | Changed to a synchronous `view.focus()` | Found while testing production: Tiptap's focus waits one animation frame, so very fast typing right after Enter landed in the title. |
| First visual polish pass used **gradients, glows and blurred background blobs** | Rejected and redesigned | It looked like generic AI output and pulled attention from the document. I replaced it with a quiet monochrome system based on Vercel Geist and Linear: a gray ramp, hairline borders, one near-black primary action, and short 150-250 ms motion that respects reduced-motion settings. |
| Markdown import | Chose to **escape** raw HTML | Safer than trusting or sanitizing arbitrary HTML. Combined with the schema filter, nothing executable can reach the database. |

## How I verified correctness, UX and reliability

- **Automated tests (15)** for the rules that matter most: who can see, edit, rename, share and delete; 409 on stale saves with the latest copy returned; schema validation rejects unknown nodes; import of `.md`, `.txt` and a real `.docx`; rejection of bad files.
- **Typecheck, lint and production build** clean before every deploy.
- **Manual browser passes** as Alice (owner), Bob (editor) and Carol (viewer): create, format, reload to confirm persistence, share, role badges, read-only mode, and a forced conflict to check the banner and both resolution buttons.
- **API error paths with curl**: unsupported file type (415), no session (401), forged cookie (401), malformed JSON (400). All return clean JSON errors.
- **Reading the diff**: I reviewed the access checks in `documents.ts` line by line, since that is where a mistake would leak data.
