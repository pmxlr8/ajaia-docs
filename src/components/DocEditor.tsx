"use client";

import type { JSONContent } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { ChevronLeft, CloudCheck, Eye, LoaderCircle, TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { can } from "@/lib/access";
import type { Collaborator, DocDetail } from "@/lib/documents";
import { baseExtensions } from "@/lib/editor/extensions";
import { api, ApiError } from "./api";
import { AvatarStack } from "./Avatar";
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

  // Poll for saves by other people. If we have no local edits, pull theirs in.
  // If we do, the next save gets a 409 and the conflict banner takes over.
  useEffect(() => {
    if (!editor) return;
    const tick = async () => {
      if (document.hidden || inFlight.current || blocked.current) return;
      try {
        const v = await api<{ version: number }>(`/api/documents/${doc.id}/version`);
        if (v.version <= version.current || dirty.current) return;
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
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [editor, doc.id, flash]);

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
      <div className="sticky top-14 z-20 border-b border-black/[0.08] bg-white/85 backdrop-blur-md">
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

      <div className="mx-auto w-full max-w-[800px] px-4 pt-5">
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

      <main className="flex-1 px-4 pb-24 pt-1">
        <article className="animate-enter mx-auto min-h-[70vh] max-w-[800px] rounded-lg border border-black/[0.08] bg-white px-6 py-10 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-16 sm:py-14">
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

      {notice && (
        <div
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
    <p className="mx-auto mt-3 max-w-[800px] text-right font-mono text-xs text-neutral-400">
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
