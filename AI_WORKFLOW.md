# AI workflow note

## Tools I used

- **Claude Code (Claude Opus 5.5)** in the Claude desktop app. This was my main pair programmer. I gave it the brief and the direction, reviewed what it produced, and pushed back where I didn't agree. It wrote most of the code, ran the tests and the typecheck, and used a built-in browser to click through the app on the dev server and on production.
- **The docs that ship inside the packages**: `node_modules/next/dist/docs` for Next.js and the Tiptap type definitions. Next 16 and Tiptap 3 both changed APIs that models often remember wrong, so the agent read these before writing code instead of going from memory.

## Where AI actually saved time

- **Scaffolding.** The route handlers, Zod schemas, Tailwind UI and the share dialog took minutes instead of hours.
- **Tests.** The access-control and conflict tests were drafted quickly, and they run against a real in-memory Postgres.
- **API lookups.** Things like the Tiptap 3 `setContent` options, `useEditorState` and the server-side `generateJSON` were checked in the installed type files rather than guessed.
- **Checking the UI.** The agent signed in as each demo user, typed, reloaded, opened the share dialog and forced a save conflict, then showed me screenshots of what it saw.

## What I changed or rejected

| What the AI suggested or did | What I did | Why |
| --- | --- | --- |
| The Next 16 starter turned on Cache Components and partial prefetching | Turned it off | Every page reads the session cookie, so a prerendered shell adds complexity without any real benefit. It also keeps old routes mounted, which felt risky for an editor with autosave timers. |
| Real-time co-editing with Yjs and WebSockets was on the table | Said no for this timebox | It needs a stateful server (Vercel functions can't hold sockets) and a lot more testing. Optimistic concurrency with polling is correct, simple, and honest about its limits. |
| SQLite on a free host, since it's the simplest storage | Said no | Free hosts usually have temporary disks, so the data would disappear when the instance sleeps. I used Neon Postgres in production and PGlite (same SQL) locally. |
| The first version of the database layer | Fixed a crash | PGlite failed on the first run because its parent folder didn't exist. We caught it in the first browser check and fixed it with a recursive `mkdir`. |
| The relative-time component ("5 min ago") | Fixed a hydration error | The tooltip used locale formatting during the server render, so it didn't match the browser. It showed up in the browser console, and I moved it to client-only state. |
| The first `.docx` test used a file made with macOS `textutil` | Replaced it with a real Word file | That file had fake bullets and no heading styles, so it couldn't prove that headings and lists map correctly. I built a proper `.docx` with python-docx and added it to the tests. |
| Pressing Enter in the title moved focus with `editor.commands.focus()` | Switched to a synchronous `view.focus()` | I found this while testing production. Tiptap's focus waits one animation frame, so if you typed very fast right after Enter, the text ended up in the title. |
| The first visual polish pass used gradients, glows and blurry background blobs | Threw it out and redesigned | Honestly, it looked like generic AI output, and it pulled attention away from the document. I replaced it with a quiet monochrome look inspired by Vercel's Geist and Linear: a gray scale, thin borders, one dark primary button, and short animations that respect reduced-motion settings. |
| Anchoring comments to the text with an editor mark was an option | Went with a quoted selection instead | A mark lives inside the document, so every new comment would change the document and bump its version, which could cause save conflicts for someone typing. A quote is stored next to the document. I wrote down the trade-off: if the quoted text changes, the link to it is lost. |
| The first version of the history and comment panels | Fixed the layout | In the browser check the side panel covered the History, Export and Share buttons in the top bar. The bar now makes room for the panel. |
| Markdown import | Chose to escape raw HTML | It's safer than trusting or trying to sanitize random HTML. Together with the schema filter, nothing executable can get into the database. |

## How I checked that it actually works

- **25 automated tests** on the parts that matter most: who can see, edit, rename, share and delete a document; a 409 with the latest copy on stale saves; the schema rejecting unknown nodes; importing `.md`, `.txt` and a real `.docx`; rejecting bad files; and, for the stretch features, presence, version history and restore, comment permissions, and a Markdown export that survives a round trip through the importer.
- **Typecheck, lint and a production build** had to pass before every deploy.
- **Manual passes in the browser** as Alice (owner), Bob (editor) and Carol (viewer): creating and formatting documents, reloading to make sure they persist, sharing, role badges, read-only mode, and a forced conflict to check the banner and both buttons.
- **The stretch features on production**: after deploying I created a temporary document on the live site, saved it, restored the first version, added a comment, checked the history, and deleted it again. Locally, I also checked with curl that a viewer gets a 403 when trying to comment.
- **API error cases with curl**: unsupported file type (415), no session (401), forged cookie (401) and broken JSON (400). They all come back as clean JSON errors.
- **Reading the code myself**: I went through the access checks in `documents.ts` line by line, because a mistake there is exactly where data would leak.
