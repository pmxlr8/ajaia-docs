"use client";

import { generateHTML, type JSONContent } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Check, ChevronLeft, CloudCheck, Download, MessageSquare, Trash2, Undo2, Eye, FileText, History, LoaderCircle, Printer, RotateCcw, TriangleAlert, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { can } from "@/lib/access";
import type { CommentView, Collaborator, DocDetail, PresenceUser, VersionSummary } from "@/lib/documents";
import { baseExtensions } from "@/lib/editor/extensions";
import { fileSlug, toMarkdown } from "@/lib/markdown";
import { api, ApiError } from "./api";
import { Avatar, AvatarStack } from "./Avatar";
import { RoleBadge } from "./RoleBadge";
import { ShareDialog } from "./ShareDialog";
import { TimeAgo } from "./TimeAgo";
import { Toolbar } from "./Toolbar";

type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";
type Conflict = { version: number; content: JSONContent; updatedByName: string | null; updatedAt: string };

const AUTOSAVE_MS = 800;
const POLL_MS = 4000;

export function DocEditor({
  doc,
  userId,
  directory,
  collaborators,
}: {
  doc: DocDetail;
  userId: string;
  directory: { email: string; name: string }[];
  collaborators: Collaborator[];
}) {
  const editable = can.edit(doc.role);
  const isOwner = doc.role === "owner";

  const [title, setTitle] = useState(doc.title);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState(doc.updatedAt);
  const [shareOpen, setShareOpen] = useState(false);
  const [lostAccess, setLostAccess] = useState(false);
  const [people, setPeople] = useState(collaborators);
  const [active, setActive] = useState<PresenceUser[]>([]);
  const [panel, setPanel] = useState<null | "history" | "comments">(null);
  const [openComments, setOpenComments] = useState(0);
  const [quote, setQuote] = useState<string | null>(null);
  const lastTyped = useRef(0);

  // Save pipeline state lives in refs so async callbacks always see the latest values.
  const version = useRef(doc.version);
  const savedTitle = useRef(doc.title);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const blocked = useRef(false); // an unresolved conflict pauses autosave
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      ...baseExtensions,
      Placeholder.configure({ placeholder: editable ? "Start writing…" : "This document is empty." }),
      CharacterCount,
    ],
    content: doc.content,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "doc-content", "aria-label": "Document body", spellcheck: "true" } },
    onUpdate: () => {
      dirty.current = true;
      lastTyped.current = Date.now();
      if (blocked.current) return;
      setState("unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => saveRef.current(), AUTOSAVE_MS);
    },
  });

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4000);
  }, []);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (!editor || blocked.current || !dirty.current) return;
    if (inFlight.current) {
      queued.current = true; // one save at a time; send the latest content when this one returns
      return;
    }
    inFlight.current = true;
    dirty.current = false;
    setState("saving");
    try {
      const res = await api<{ version: number; updatedAt: string }>(`/api/documents/${doc.id}`, {
        method: "PATCH",
        json: { content: editor.getJSON(), baseVersion: version.current },
      });
      version.current = res.version;
      setLastSaved(res.updatedAt);
      setError(null);
      setState(dirty.current ? "unsaved" : "saved");
    } catch (e) {
      dirty.current = true;
      const err = e as ApiError;
      if (err.status === 409) {
        blocked.current = true;
        setConflict(err.details as Conflict);
        setState("conflict");
      } else {
        setState("error");
        setError(err.message);
        if (err.status === 403 || err.status === 404) {
          setLostAccess(true);
          editor.setEditable(false);
        } else if (err.status === 0 || err.status >= 500) {
          timer.current = setTimeout(() => saveRef.current(), 5000); // transient: retry
        }
      }
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        if (dirty.current && !blocked.current) saveRef.current();
      }
    }
  }, [editor, doc.id]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /** Fire-and-forget save that survives navigation (used when leaving the page). */
  const flushOnLeave = useCallback(() => {
    if (!editor || !dirty.current || blocked.current || inFlight.current) return;
    clearTimeout(timer.current);
    fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editor.getJSON(), baseVersion: version.current }),
    }).catch(() => {});
    dirty.current = false;
  }, [editor, doc.id]);

  // Cmd/Ctrl+S saves now; warn before closing the tab with unsaved work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", flushOnLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", flushOnLeave);
    };
  }, [flushOnLeave]);

  // Heartbeat + poll: tells the server we are here (and whether we are typing),
  // learns who else is here, and notices saves by other people. If we have no
  // local edits, pull theirs in. If we do, the next save gets a 409 and the
  // conflict banner takes over.
  useEffect(() => {
    if (!editor) return;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const editing = dirty.current || Date.now() - lastTyped.current < 8000;
        const v = await api<{ version: number; active: PresenceUser[]; openComments: number }>(`/api/documents/${doc.id}/presence`, {
          method: "POST",
          json: { editing },
        });
        setActive(v.active);
        setOpenComments(v.openComments);
        if (inFlight.current || blocked.current || v.version <= version.current || dirty.current) return;
        const latest = await api<DocDetail>(`/api/documents/${doc.id}`);
        if (dirty.current || inFlight.current || latest.version <= version.current) return;
        editor.commands.setContent(latest.content, { emitUpdate: false });
        version.current = latest.version;
        setLastSaved(latest.updatedAt);
        if (document.activeElement?.id !== "doc-title") {
          savedTitle.current = latest.title;
          setTitle(latest.title);
        }
        flash(`Updated with ${latest.updatedByName ?? "someone"}'s latest changes`);
      } catch (e) {
        if ((e as ApiError).status === 404) {
          setLostAccess(true);
          editor.setEditable(false);
        }
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [editor, doc.id, flash]);

  function exportMarkdown() {
    if (!editor) return;
    const json = editor.getJSON() as JSONContent;
    const first = json.content?.[0];
    const firstText = (first?.content ?? []).map((n) => n.text ?? "").join("").trim();
    const startsWithTitle = first?.type === "heading" && firstText === title.trim();
    const md = (startsWithTitle ? "" : `# ${title || "Untitled document"}\n\n`) + toMarkdown(json);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileSlug(title)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restoreVersion(v: VersionSummary): Promise<boolean> {
    if (!editor) return false;
    if (dirty.current || inFlight.current) {
      flash("Your latest changes are still saving. Try again in a second.");
      return false;
    }
    try {
      const res = await api<{ version: number; updatedAt: string; content: JSONContent }>(`/api/documents/${doc.id}/versions/${v.id}`, {
        method: "POST",
        json: { baseVersion: version.current },
      });
      clearTimeout(timer.current);
      editor.commands.setContent(res.content, { emitUpdate: false });
      version.current = res.version;
      dirty.current = false;
      setLastSaved(res.updatedAt);
      setState("saved");
      flash("Version restored");
      return true;
    } catch (e) {
      const err = e as ApiError;
      flash(err.status === 409 ? "Someone saved a newer version. Check the latest one and try again." : err.message);
      return false;
    }
  }

  useEffect(() => {
    document.title = `${title || "Untitled document"} - Ajaia Docs`;
  }, [title]);

  async function commitTitle() {
    const next = title.replace(/\s+/g, " ").trim();
    if (!next || next === savedTitle.current) {
      setTitle(savedTitle.current);
      return;
    }
    try {
      const res = await api<{ title: string }>(`/api/documents/${doc.id}`, { method: "PATCH", json: { title: next } });
      savedTitle.current = res.title;
      setTitle(res.title);
      flash("Renamed");
    } catch (e) {
      setTitle(savedTitle.current);
      setError((e as Error).message);
    }
  }

  function resolveConflict(keep: "theirs" | "mine") {
    if (!editor || !conflict) return;
    version.current = conflict.version;
    blocked.current = false;
    setConflict(null);
    if (keep === "theirs") {
      editor.commands.setContent(conflict.content, { emitUpdate: false });
      dirty.current = false;
      setLastSaved(conflict.updatedAt);
      setState("saved");
    } else {
      dirty.current = true;
      saveRef.current();
    }
  }

  return (
    <>
      <div
        data-print-hide
        className={`sticky top-14 z-20 border-b border-black/[0.08] bg-white/85 backdrop-blur-md transition-[padding] duration-200 ${panel ? "lg:pr-[400px]" : ""}`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
          <Link
            href="/docs"
            onClick={flushOnLeave}
            className="-ml-1.5 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Back to documents"
            title="Back to documents"
          >
            <ChevronLeft size={18} aria-hidden />
          </Link>
          <input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
                editor?.view.focus(); // synchronous; commands.focus() waits a frame and fast typing can land in the title
              }
              if (e.key === "Escape") {
                setTitle(savedTitle.current);
                (e.target as HTMLInputElement).blur();
              }
            }}
            readOnly={!can.rename(doc.role) || lostAccess}
            maxLength={200}
            aria-label="Document title"
            className="min-w-[10rem] flex-1 rounded-md border border-transparent px-2 py-1 text-[15px] font-medium tracking-tight transition-colors hover:border-black/10 focus:border-neutral-900 focus:outline-none read-only:hover:border-transparent"
          />
          <SaveStatus state={state} editable={editable && !lostAccess} lastSaved={lastSaved} />
          {!isOwner && (
            <span className="hidden items-center gap-2 text-[13px] text-neutral-500 lg:flex">
              Shared by {doc.ownerName} <RoleBadge role={doc.role} />
            </span>
          )}
          <PresenceIndicator people={active} />
          <span className="mx-0.5 hidden h-4 w-px bg-black/10 sm:block" aria-hidden />
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="hidden rounded-full p-0.5 transition-colors hover:bg-neutral-100 sm:block"
            aria-label="People with access"
            title={people.map((p) => p.name).join(", ")}
          >
            <AvatarStack people={people} max={3} size={24} />
          </button>
          {editable && !lostAccess && (
            <button
              type="button"
              onClick={() => setPanel((p) => (p === "history" ? null : "history"))}
              aria-pressed={panel === "history"}
              className={`btn btn-ghost h-8 px-2 text-[13px] ${panel === "history" ? "bg-neutral-100 text-neutral-900" : ""}`}
              title="Version history"
            >
              <History size={15} aria-hidden />
              <span className={panel ? "hidden" : "hidden lg:inline"}>History</span>
            </button>
          )}
          {!lostAccess && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (panel === "comments") return setPanel(null);
                if (editor) {
                  const { from, to } = editor.state.selection;
                  setQuote(from < to ? editor.state.doc.textBetween(from, to, " ") : null);
                }
                setPanel("comments");
              }}
              aria-pressed={panel === "comments"}
              className={`btn btn-ghost relative h-8 px-2 text-[13px] ${panel === "comments" ? "bg-neutral-100 text-neutral-900" : ""}`}
              title={editable ? "Comments (select text first to comment on it)" : "Comments"}
            >
              <MessageSquare size={15} aria-hidden />
              <span className={panel ? "hidden" : "hidden lg:inline"}>Comments</span>
              {openComments > 0 && (
                <span className="ml-0.5 rounded-full bg-neutral-900 px-1.5 text-[11px] font-medium leading-[18px] text-white">{openComments}</span>
              )}
            </button>
          )}
          <ExportMenu compact={panel !== null} onMarkdown={exportMarkdown} onPrint={() => window.print()} />
          <button type="button" onClick={() => setShareOpen(true)} className={`btn h-8 px-3 text-[13px] ${isOwner ? "btn-primary" : "btn-secondary"}`}>
            {isOwner ? "Share" : "People"}
          </button>
        </div>
        {editable && editor && !lostAccess && (
          <div className="mx-auto flex max-w-6xl justify-center px-4 pb-2 sm:px-6">
            <Toolbar editor={editor} />
          </div>
        )}
      </div>

      <div data-print-hide className="mx-auto w-full max-w-[800px] px-4 pt-5">
        {conflict && (
          <Banner tone="warn">
            <TriangleAlert size={15} className="shrink-0" aria-hidden />
            <span className="flex-1">
              <strong className="font-medium">{conflict.updatedByName ?? "Someone"}</strong> saved a newer version while you were editing. Your recent changes are not saved yet.
            </span>
            <button type="button" onClick={() => resolveConflict("theirs")} className="btn btn-secondary h-8 px-3 text-[13px]">
              Load their version
            </button>
            <button type="button" onClick={() => resolveConflict("mine")} className="btn btn-primary h-8 px-3 text-[13px]">
              Keep mine
            </button>
          </Banner>
        )}
        {lostAccess && (
          <Banner tone="error">
            <TriangleAlert size={15} className="shrink-0" aria-hidden />
            You no longer have edit access to this document. Copy any text you need, then go back.
          </Banner>
        )}
        {error && !lostAccess && (
          <Banner tone="error">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-[13px] underline underline-offset-2">
              Dismiss
            </button>
          </Banner>
        )}
        {!editable && !lostAccess && (
          <Banner tone="info">
            <Eye size={15} className="shrink-0 text-neutral-400" aria-hidden />
            You can view this document. Ask {doc.ownerName} for edit access.
          </Banner>
        )}
      </div>

      <main className={`print-root flex-1 px-4 pb-24 pt-1 transition-[padding] duration-200 ${panel ? "lg:pr-[400px]" : ""}`}>
        <article className="print-page animate-enter mx-auto min-h-[70vh] max-w-[800px] rounded-lg border border-black/[0.08] bg-white px-6 py-10 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-16 sm:py-14">
          <h1 className="mb-6 hidden text-3xl font-semibold tracking-tight print:block">{title || "Untitled document"}</h1>
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="space-y-3" aria-label="Loading editor">
              <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
              <div className="h-4 w-full animate-pulse rounded bg-neutral-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-100" />
            </div>
          )}
        </article>
        {editor && <WordCount editor={editor} />}
      </main>

      {panel === "history" && editor && (
        <HistoryPanel docId={doc.id} onClose={() => setPanel(null)} onRestore={restoreVersion} />
      )}
      {panel === "comments" && editor && (
        <CommentsPanel
          docId={doc.id}
          editor={editor}
          canComment={editable}
          quote={quote}
          onClearQuote={() => setQuote(null)}
          openCount={openComments}
          onCount={setOpenComments}
          onClose={() => setPanel(null)}
        />
      )}

      {notice && (
        <div
          data-print-hide
          role="status"
          className="animate-toast fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] text-neutral-800 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.18)]"
        >
          <CloudCheck size={15} className="shrink-0 text-neutral-500" aria-hidden />
          {notice}
        </div>
      )}

      {shareOpen && (
        <ShareDialog
          docId={doc.id}
          docTitle={title || "Untitled document"}
          isOwner={isOwner}
          ownerName={doc.ownerName}
          currentUserId={userId}
          directory={directory}
          onClose={() => setShareOpen(false)}
          onChange={setPeople}
        />
      )}
    </>
  );
}

function WordCount({ editor }: { editor: Editor }) {
  const { words, chars } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      words: e.storage.characterCount.words(),
      chars: e.storage.characterCount.characters(),
    }),
  });
  return (
    <p data-print-hide className="mx-auto mt-3 max-w-[800px] text-right font-mono text-xs text-neutral-400">
      {words} {words === 1 ? "word" : "words"} · {chars} characters
    </p>
  );
}

function SaveStatus({ state, editable, lastSaved }: { state: SaveState; editable: boolean; lastSaved: string }) {
  const base = "inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap";
  if (!editable) {
    return (
      <span className={`${base} text-neutral-500`}>
        <Eye size={14} aria-hidden /> View only
      </span>
    );
  }
  const map: Record<SaveState, { icon: React.ReactNode; text: React.ReactNode; cls: string }> = {
    saved: {
      icon: <CloudCheck size={14} aria-hidden />,
      text: (
        <>
          Saved <span className="text-neutral-300">·</span> <TimeAgo iso={lastSaved} />
        </>
      ),
      cls: "text-neutral-500",
    },
    unsaved: { icon: <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" aria-hidden />, text: "Unsaved changes", cls: "text-neutral-500" },
    saving: { icon: <LoaderCircle size={14} className="animate-spin" aria-hidden />, text: "Saving…", cls: "text-neutral-500" },
    error: { icon: <WifiOff size={14} aria-hidden />, text: "Not saved", cls: "text-red-600" },
    conflict: { icon: <TriangleAlert size={14} aria-hidden />, text: "Conflict", cls: "text-amber-700" },
  };
  const { icon, text, cls } = map[state];
  return (
    <span className={`${base} ${cls}`} role="status" aria-live="polite">
      {icon}
      {text}
    </span>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  const cls = {
    info: "border-black/[0.08] bg-white text-neutral-700",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
  }[tone];
  return <div className={`animate-pop mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}

function PresenceIndicator({ people }: { people: PresenceUser[] }) {
  if (people.length === 0) return null;
  const first = people[0].name.split(" ")[0];
  const label =
    people.length === 1 ? `${first} is ${people[0].editing ? "editing" : "here"}` : `${people.length} others here`;
  return (
    <span className="animate-fade hidden items-center gap-2 text-[13px] text-neutral-500 md:flex" aria-live="polite">
      <span className="flex -space-x-1.5">
        {people.map((p) => (
          <span key={p.userId} className="relative" title={`${p.name} is ${p.editing ? "editing" : "viewing"}`}>
            <Avatar name={p.name} color={p.color} size={22} ring />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white ${p.editing ? "animate-blink" : ""}`}
              aria-hidden
            />
          </span>
        ))}
      </span>
      {label}
    </span>
  );
}

function ExportMenu({ compact, onMarkdown, onPrint }: { compact: boolean; onMarkdown: () => void; onPrint: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-100";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn btn-ghost h-8 px-2 text-[13px]"
        title="Export"
      >
        <Download size={15} aria-hidden />
        <span className={compact ? "hidden" : "hidden lg:inline"}>Export</span>
      </button>
      {open && (
        <div role="menu" className="animate-pop absolute right-0 top-10 z-30 w-52 rounded-lg border border-black/[0.08] bg-white p-1 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.18)]">
          <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), onMarkdown())}>
            <FileText size={15} className="text-neutral-400" aria-hidden /> Markdown (.md)
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), onPrint())}>
            <Printer size={15} className="text-neutral-400" aria-hidden /> PDF (print or save)
          </button>
        </div>
      )}
    </div>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function HistoryPanel({
  docId,
  onClose,
  onRestore,
}: {
  docId: string;
  onClose: () => void;
  onRestore: (v: VersionSummary) => Promise<boolean>;
}) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VersionSummary | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    api<{ versions: VersionSummary[] }>(`/api/documents/${docId}/versions`)
      .then(({ versions: list }) => {
        if (!alive) return;
        setVersions(list);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [docId, reload]);

  // The newest row is always the document as it is now.
  const currentId = versions?.[0]?.id;

  async function select(v: VersionSummary) {
    setSelected(v);
    try {
      const full = await api<{ content: JSONContent }>(`/api/documents/${docId}/versions/${v.id}`);
      setPreview({ id: v.id, html: generateHTML(full.content, baseExtensions) });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const tags = (v: VersionSummary) =>
    [v.kind === "baseline" && "Original", v.kind === "restore" && "Restored", v.id === currentId && "Current"].filter(Boolean) as string[];

  return (
    <aside
      data-print-hide
      className="animate-slide fixed bottom-0 right-0 top-14 z-30 flex w-full max-w-[400px] flex-col border-l border-black/[0.08] bg-white shadow-[0_0_40px_-12px_rgba(0,0,0,0.15)]"
      aria-label="Version history"
    >
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Version history</h2>
          <p className="text-xs text-neutral-500">Saves by one person within 2 min are grouped.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Close history">
          <X size={16} aria-hidden />
        </button>
      </div>

      {error && <p className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ul className="max-h-[45%] overflow-y-auto border-b border-black/[0.06] p-2">
        {versions === null && !error && (
          <li className="space-y-2 p-2" aria-busy>
            <div className="h-3 w-40 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-28 animate-pulse rounded bg-neutral-100" />
          </li>
        )}
        {versions?.length === 0 && (
          <li className="p-3 text-sm text-neutral-500">No history yet. Versions appear here after the first save.</li>
        )}
        {versions?.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => select(v)}
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors ${
                selected?.id === v.id ? "bg-neutral-100" : "hover:bg-neutral-50"
              }`}
            >
              <Avatar name={v.authorName ?? "?"} color={v.authorColor ?? "#a3a3a3"} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-neutral-900">{fmtDate(v.createdAt)}</span>
                <span className="block truncate text-xs text-neutral-500">{v.authorName ?? "Unknown"}</span>
              </span>
              {tags(v).map((t) => (
                <span
                  key={t}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    t === "Current" ? "border-neutral-900 bg-neutral-900 text-white" : "border-black/[0.08] text-neutral-600"
                  }`}
                >
                  {t}
                </span>
              ))}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex min-h-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <p className="text-xs text-neutral-500">Preview of {fmtDate(selected.createdAt)}</p>
              <button
                type="button"
                disabled={busy || selected.id === currentId}
                onClick={async () => {
                  setBusy(true);
                  if (await onRestore(selected)) {
                    setSelected(null);
                    setPreview(null);
                    setReload((n) => n + 1);
                  }
                  setBusy(false);
                }}
                className="btn btn-primary h-8 px-3 text-[13px]"
              >
                <RotateCcw size={14} aria-hidden />
                {busy ? "Restoring…" : "Restore this version"}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              {preview?.id === selected.id ? (
                <div className="doc-content !min-h-0 text-[14px]" dangerouslySetInnerHTML={{ __html: preview.html }} />
              ) : (
                <div className="h-3 w-40 animate-pulse rounded bg-neutral-100" />
              )}
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-neutral-500">Select a version to preview it.</p>
        )}
      </div>
    </aside>
  );
}

/** Select the first place in the document where the quoted text appears. */
function findQuote(editor: Editor, quote: string) {
  const needle = quote.slice(0, 60);
  let hit: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (hit || !node.isText || !node.text) return !hit;
    const i = node.text.indexOf(needle);
    if (i >= 0) hit = { from: pos + i, to: pos + i + needle.length };
    return false;
  });
  if (!hit) return false;
  editor.chain().focus().setTextSelection(hit).scrollIntoView().run();
  return true;
}

function CommentsPanel({
  docId,
  editor,
  canComment,
  quote,
  onClearQuote,
  openCount,
  onCount,
  onClose,
}: {
  docId: string;
  editor: Editor;
  canComment: boolean;
  quote: string | null;
  onClearQuote: () => void;
  openCount: number;
  onCount: (n: number) => void;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [reload, setReload] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);

  // Load on open, after our own changes, and whenever the open count from the
  // heartbeat changes (someone else commented or resolved).
  useEffect(() => {
    let alive = true;
    api<{ comments: CommentView[] }>(`/api/documents/${docId}/comments`)
      .then(({ comments: list }) => {
        if (!alive) return;
        setComments(list);
        setError(null);
        onCount(list.filter((c) => !c.resolved).length);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [docId, reload, openCount, onCount]);

  useEffect(() => {
    if (canComment) box.current?.focus();
  }, [canComment, quote]);

  async function submit() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await api(`/api/documents/${docId}/comments`, { method: "POST", json: { body: draft, quote } });
      setDraft("");
      onClearQuote();
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(c: CommentView, action: "resolve" | "reopen" | "delete") {
    try {
      await api(`/api/documents/${docId}/comments/${c.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        json: action === "delete" ? undefined : { resolved: action === "resolve" },
      });
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const open = comments?.filter((c) => !c.resolved) ?? [];
  const resolved = comments?.filter((c) => c.resolved) ?? [];
  const shown = showResolved ? [...open, ...resolved] : open;

  return (
    <aside
      data-print-hide
      className="animate-slide fixed bottom-0 right-0 top-14 z-30 flex w-full max-w-[400px] flex-col border-l border-black/[0.08] bg-white shadow-[0_0_40px_-12px_rgba(0,0,0,0.15)]"
      aria-label="Comments"
    >
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Comments</h2>
          <p className="text-xs text-neutral-500">
            {canComment ? "Select text in the document, then open Comments to quote it." : "You can read comments. Editors can add them."}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Close comments">
          <X size={16} aria-hidden />
        </button>
      </div>

      {canComment && (
        <form
          className="border-b border-black/[0.06] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {quote && (
            <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-neutral-900 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-600">
              <span className="line-clamp-2 flex-1">“{quote}”</span>
              <button type="button" onClick={onClearQuote} className="text-neutral-400 hover:text-neutral-900" aria-label="Remove quote">
                <X size={13} aria-hidden />
              </button>
            </div>
          )}
          <textarea
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder={quote ? "Comment on this text…" : "Add a comment…"}
            className="w-full resize-none rounded-md border border-black/[0.1] px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">
              <kbd className="kbd">⌘</kbd> <kbd className="kbd">Enter</kbd> to post
            </span>
            <button type="submit" disabled={!draft.trim() || busy} className="btn btn-primary h-8 px-3 text-[13px]">
              {busy ? "Posting…" : "Comment"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {comments === null && !error && (
          <li className="space-y-2 p-2" aria-busy>
            <div className="h-3 w-40 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
          </li>
        )}
        {comments !== null && shown.length === 0 && (
          <li className="p-2 text-sm text-neutral-500">{resolved.length ? "No open comments." : "No comments yet."}</li>
        )}
        {shown.map((c) => (
          <li key={c.id} className={`animate-fade rounded-lg border border-black/[0.08] p-3 ${c.resolved ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2">
              <Avatar name={c.authorName} color={c.authorColor} size={22} />
              <span className="text-[13px] font-medium text-neutral-900">{c.authorName}</span>
              <span className="text-xs text-neutral-400">
                <TimeAgo iso={c.createdAt} />
              </span>
              {c.resolved && <span className="ml-auto rounded-full border border-black/[0.08] px-2 py-0.5 text-[11px] text-neutral-600">Resolved</span>}
            </div>
            {c.quote && (
              <button
                type="button"
                onClick={() => findQuote(editor, c.quote!)}
                className="mt-2 block w-full rounded-md border-l-2 border-neutral-300 bg-neutral-50 px-2.5 py-1 text-left text-xs text-neutral-600 hover:border-neutral-900"
                title="Show in document"
              >
                <span className="line-clamp-2">“{c.quote}”</span>
              </button>
            )}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-800">{c.body}</p>
            {(canComment || c.canDelete) && (
              <div className="mt-2 flex gap-1">
                {canComment && (
                  <button
                    type="button"
                    onClick={() => act(c, c.resolved ? "reopen" : "resolve")}
                    className="btn btn-ghost h-7 px-2 text-xs"
                  >
                    {c.resolved ? <Undo2 size={13} aria-hidden /> : <Check size={13} aria-hidden />}
                    {c.resolved ? "Reopen" : "Resolve"}
                  </button>
                )}
                {c.canDelete && (
                  <button type="button" onClick={() => act(c, "delete")} className="btn btn-ghost h-7 px-2 text-xs text-neutral-500">
                    <Trash2 size={13} aria-hidden /> Delete
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {resolved.length > 0 && (
        <button
          type="button"
          onClick={() => setShowResolved((s) => !s)}
          className="border-t border-black/[0.06] px-4 py-2.5 text-left text-xs text-neutral-500 hover:text-neutral-900"
        >
          {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
        </button>
      )}
    </aside>
  );
}
