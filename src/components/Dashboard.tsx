"use client";

import { FileText, FileUp, Lock, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DocSummary } from "@/lib/documents";
import { api } from "./api";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";
import { TimeAgo } from "./TimeAgo";

const ACCEPT = [".txt", ".md", ".markdown", ".docx"];
const MAX_BYTES = 2 * 1024 * 1024;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const noopSubscribe = () => () => {};

export function Dashboard({
  firstName,
  email,
  owned,
  shared,
}: {
  firstName: string;
  email: string;
  owned: DocSummary[];
  shared: DocSummary[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "create" | "import">(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState(false);
  // Local time only exists in the browser; the server renders a neutral greeting.
  const hello = useSyncExternalStore(noopSubscribe, greeting, () => "Welcome back");

  async function createDoc() {
    setBusy("create");
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/documents", { method: "POST", json: {} });
      router.push(`/docs/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function importDoc(file: File) {
    setError(null);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPT.includes(ext)) return setError("Unsupported file type. Upload a .txt, .md or .docx file.");
    if (file.size > MAX_BYTES) return setError("Files must be 2 MB or smaller.");
    setBusy("import");
    const body = new FormData();
    body.append("file", file);
    try {
      const { id } = await api<{ id: string }>("/api/import", { method: "POST", body });
      router.push(`/docs/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  // Drop a file anywhere on the page to import it; "/" focuses search.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) importDoc(f);
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName)) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filter = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (docs: DocSummary[]) =>
      needle ? docs.filter((d) => `${d.title} ${d.snippet} ${d.ownerName}`.toLowerCase().includes(needle)) : docs;
  }, [q]);
  const ownedShown = filter(owned);
  const sharedShown = filter(shared);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-10 sm:px-6">
      <div className="animate-enter flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-neutral-950">
            {hello}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Signed in as {email}
            <span className="mx-1.5 text-neutral-300">·</span>
            <span className="font-mono text-[13px]">{owned.length}</span> owned
            <span className="mx-1.5 text-neutral-300">·</span>
            <span className="font-mono text-[13px]">{shared.length}</span> shared with you
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy !== null} className="btn btn-secondary">
            <Upload size={15} aria-hidden />
            {busy === "import" ? "Importing…" : "Import file"}
          </button>
          <button type="button" onClick={createDoc} disabled={busy !== null} className="btn btn-primary">
            <Plus size={16} aria-hidden />
            {busy === "create" ? "Creating…" : "New document"}
          </button>
        </div>
      </div>

      <div className="animate-enter mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: "40ms" }}>
        <label className="relative flex w-full items-center sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 text-neutral-400" aria-hidden />
          <input
            ref={searchInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents"
            aria-label="Search documents"
            className="h-9 w-full rounded-lg border border-black/[0.1] bg-white pl-9 pr-9 text-sm transition-colors placeholder:text-neutral-400 hover:border-black/20 focus:border-neutral-900 focus:outline-none"
          />
          <kbd className="kbd pointer-events-none absolute right-2.5">/</kbd>
        </label>
        <p className="text-xs leading-relaxed text-neutral-500 sm:max-w-sm sm:text-right">
          Import supports .txt, .md and .docx up to 2 MB. Images and tables are not imported. Tip: drop a file anywhere on this page.
        </p>
      </div>
      {error && (
        <p role="alert" className="animate-pop mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <Section
        id="owned"
        title="My documents"
        docs={ownedShown}
        total={owned.length}
        query={q}
        empty={{ title: "No documents yet", body: "Create one, or drop a .docx, .md or .txt file here.", cta: true }}
        onCreate={createDoc}
        onDeleted={() => router.refresh()}
      />
      <Section
        id="shared"
        title="Shared with me"
        docs={sharedShown}
        total={shared.length}
        query={q}
        empty={{ title: "Nothing shared yet", body: "When someone shares a document with you, it shows up here." }}
        baseDelay={ownedShown.length}
      />

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) importDoc(f);
        }}
      />

      {dragging && (
        <div className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-white/80 p-6 backdrop-blur-sm">
          <div className="animate-pop flex w-full max-w-md flex-col items-center rounded-xl border border-dashed border-neutral-400 bg-white px-8 py-12 text-center">
            <FileUp size={22} className="text-neutral-500" aria-hidden />
            <p className="mt-3 text-base font-medium">Drop to import</p>
            <p className="mt-1 text-sm text-neutral-500">.docx, .md or .txt, up to 2 MB. It opens as a new document.</p>
          </div>
        </div>
      )}
    </main>
  );
}

function Section(props: {
  id: string;
  title: string;
  docs: DocSummary[];
  total: number;
  query: string;
  empty: { title: string; body: string; cta?: boolean };
  baseDelay?: number;
  onCreate?: () => void;
  onDeleted?: () => void;
}) {
  const ownedList = props.id === "owned";
  return (
    <section className="mt-10" aria-labelledby={`${props.id}-heading`}>
      <h2 id={`${props.id}-heading`} className="mb-3 flex items-baseline gap-2 text-sm font-medium text-neutral-900">
        {props.title}
        <span className="font-mono text-xs font-normal text-neutral-400">{props.total}</span>
      </h2>

      {props.docs.length === 0 ? (
        <div className="animate-enter flex flex-col items-center rounded-xl border border-dashed border-black/[0.12] px-6 py-12 text-center">
          <p className="text-sm font-medium text-neutral-900">{props.query ? "No matches" : props.empty.title}</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            {props.query ? `Nothing in ${props.title.toLowerCase()} matches "${props.query}".` : props.empty.body}
          </p>
          {props.empty.cta && !props.query && (
            <button type="button" onClick={props.onCreate} className="btn btn-primary mt-5">
              <Plus size={16} aria-hidden /> New document
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
          <div className="hidden items-center gap-4 border-b border-black/[0.06] bg-neutral-50/80 px-4 py-2 pr-14 text-xs text-neutral-500 sm:flex">
            <span className="flex-1">Name</span>
            <span className="hidden w-40 md:block">Owner</span>
            <span className="w-32">{ownedList ? "Sharing" : "Your access"}</span>
            <span className="w-20 text-right">Updated</span>
          </div>
          <ul>
            {props.docs.map((d, i) => (
              <DocRow key={d.id} doc={d} delay={((props.baseDelay ?? 0) + i) * 30} onDeleted={props.onDeleted} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DocRow({ doc, delay, onDeleted }: { doc: DocSummary; delay: number; onDeleted?: () => void }) {
  const owned = doc.role === "owner";
  const [busy, setBusy] = useState(false);

  return (
    <li
      className="animate-enter group relative border-b border-black/[0.06] last:border-b-0"
      style={{ animationDelay: `${Math.min(delay, 400)}ms` }}
    >
      <Link
        href={`/docs/${doc.id}`}
        className="flex items-center gap-4 px-4 py-3 pr-14 transition-colors duration-150 hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-offset-[-2px]"
      >
        <FileText size={16} className="shrink-0 text-neutral-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">{doc.title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-neutral-500">{doc.snippet || "Empty document"}</span>
        </span>
        <span className="hidden w-40 items-center gap-2 text-[13px] text-neutral-600 md:flex">
          <Avatar name={doc.ownerName} color={doc.ownerColor} size={20} />
          <span className="truncate">{owned ? "You" : doc.ownerName}</span>
        </span>
        <span className="hidden w-32 text-[13px] text-neutral-600 sm:block">
          {owned ? (
            doc.shareCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} className="text-neutral-400" aria-hidden /> Shared with {doc.shareCount}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Lock size={13} className="text-neutral-400" aria-hidden /> Private
              </span>
            )
          ) : (
            <RoleBadge role={doc.role} />
          )}
        </span>
        <span className="w-20 shrink-0 text-right font-mono text-xs text-neutral-400">
          <TimeAgo iso={doc.updatedAt} />
        </span>
      </Link>

      {owned && (
        <button
          type="button"
          disabled={busy}
          title="Delete document"
          aria-label={`Delete ${doc.title}`}
          onClick={async () => {
            if (!confirm(`Delete "${doc.title}"? People you shared it with lose access too.`)) return;
            setBusy(true);
            try {
              await api(`/api/documents/${doc.id}`, { method: "DELETE" });
              onDeleted?.();
            } catch (e) {
              alert((e as Error).message);
              setBusy(false);
            }
          }}
          className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 focus:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 size={15} aria-hidden />
        </button>
      )}
    </li>
  );
}
