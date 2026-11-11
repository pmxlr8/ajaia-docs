"use client";

import type { JSONContent } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { can } from "@/lib/access";
import type { DocDetail } from "@/lib/documents";
import { baseExtensions } from "@/lib/editor/extensions";
import { api, ApiError } from "./api";
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
}: {
  doc: DocDetail;
  userId: string;
  directory: { email: string; name: string }[];
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
      <div className="sticky top-14 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
          <Link
            href="/docs"
            onClick={flushOnLeave}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Back to documents"
            title="Back to documents"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
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
                editor?.commands.focus();
              }
              if (e.key === "Escape") {
                setTitle(savedTitle.current);
                (e.target as HTMLInputElement).blur();
              }
            }}
            readOnly={!can.rename(doc.role) || lostAccess}
            maxLength={200}
            aria-label="Document title"
            className="min-w-[10rem] flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-medium hover:border-slate-200 focus:border-blue-500 focus:outline-none read-only:hover:border-transparent"
          />
          <SaveStatus state={state} editable={editable && !lostAccess} lastSaved={lastSaved} />
          {!isOwner && (
            <span className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
              Shared by {doc.ownerName} <RoleBadge role={doc.role} />
            </span>
          )}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />
            </svg>
            {isOwner ? "Share" : "People"}
          </button>
        </div>
        {editable && editor && !lostAccess && (
          <div className="mx-auto max-w-6xl border-t border-slate-100 px-4 py-1">
            <Toolbar editor={editor} />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[860px] px-4 pt-4">
        {conflict && (
          <Banner tone="warn">
            <span className="flex-1">
              <strong>{conflict.updatedByName ?? "Someone"}</strong> saved a newer version while you were editing. Your recent changes are not saved yet.
            </span>
            <button type="button" onClick={() => resolveConflict("theirs")} className="rounded-md border border-amber-300 bg-white px-3 py-1 text-sm hover:bg-amber-100">
              Load their version
            </button>
            <button type="button" onClick={() => resolveConflict("mine")} className="rounded-md bg-amber-600 px-3 py-1 text-sm text-white hover:bg-amber-700">
              Keep mine
            </button>
          </Banner>
        )}
        {lostAccess && <Banner tone="error">You no longer have edit access to this document. Copy any text you need, then go back.</Banner>}
        {error && !lostAccess && (
          <Banner tone="error">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-sm underline">
              Dismiss
            </button>
          </Banner>
        )}
        {!editable && !lostAccess && (
          <Banner tone="info">You can view this document. Ask {doc.ownerName} for edit access.</Banner>
        )}
        {notice && <Banner tone="info">{notice}</Banner>}
      </div>

      <main className="flex-1 px-4 pb-24 pt-2">
        <article className="mx-auto min-h-[70vh] max-w-[816px] rounded-sm border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-16 sm:py-14">
          {editor ? <EditorContent editor={editor} /> : <div className="doc-content text-slate-400">Loading editor…</div>}
        </article>
      </main>

      {shareOpen && (
        <ShareDialog
          docId={doc.id}
          isOwner={isOwner}
          ownerName={doc.ownerName}
          currentUserId={userId}
          directory={directory}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}

function SaveStatus({ state, editable, lastSaved }: { state: SaveState; editable: boolean; lastSaved: string }) {
  if (!editable) return <span className="text-sm text-slate-500">View only</span>;
  const map: Record<SaveState, { text: React.ReactNode; cls: string }> = {
    saved: { text: <>Saved · <TimeAgo iso={lastSaved} /></>, cls: "text-slate-500" },
    unsaved: { text: "Unsaved changes", cls: "text-slate-500" },
    saving: { text: "Saving…", cls: "text-slate-500" },
    error: { text: "Not saved", cls: "text-red-600" },
    conflict: { text: "Conflict", cls: "text-amber-700" },
  };
  const { text, cls } = map[state];
  return (
    <span className={`text-sm ${cls}`} role="status" aria-live="polite">
      {text}
    </span>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  const cls = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
  }[tone];
  return <div className={`mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}
