"use client";

import { useEffect, useRef, useState } from "react";
import type { ShareRole } from "@/lib/access";
import type { Collaborator } from "@/lib/documents";
import { api } from "./api";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";

type Props = {
  docId: string;
  isOwner: boolean;
  ownerName: string;
  currentUserId: string;
  directory: { email: string; name: string }[];
  onClose: () => void;
  onChange?: (count: number) => void;
};

export function ShareDialog({ docId, isOwner, ownerName, currentUserId, directory, onClose, onChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [people, setPeople] = useState<Collaborator[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    api<{ collaborators: Collaborator[] }>(`/api/documents/${docId}/shares`)
      .then((r) => setPeople(r.collaborators))
      .catch((e) => setError(e.message));
  }, [docId]);

  function apply(list: Collaborator[]) {
    setPeople(list);
    onChange?.(list.length - 1);
  }

  async function run(fn: () => Promise<{ collaborators: Collaborator[] }>) {
    setBusy(true);
    setError(null);
    try {
      apply((await fn()).collaborators);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const grant = (targetEmail: string, r: ShareRole) =>
    run(() => api(`/api/documents/${docId}/shares`, { method: "POST", json: { email: targetEmail, role: r } }));
  const revoke = (userId: string) => run(() => api(`/api/documents/${docId}/shares/${userId}`, { method: "DELETE" }));

  const taken = new Set(people?.map((p) => p.email));
  const suggestions = directory.filter((u) => !taken.has(u.email));

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/30"
      aria-labelledby="share-title"
    >
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="share-title" className="text-lg font-semibold">Share document</h2>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {isOwner ? (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email.trim()) return setError("Enter an email address.");
              if (await grant(email.trim(), role)) setEmail("");
            }}
          >
            <input
              type="email"
              list="share-directory"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Add people by email"
              aria-label="Email address"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <datalist id="share-directory">
              {suggestions.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.name}
                </option>
              ))}
            </datalist>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ShareRole)}
              aria-label="Access level"
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              Share
            </button>
          </form>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Only the owner ({ownerName}) can change who has access.</p>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <h3 className="mb-2 mt-6 text-sm font-medium text-slate-700">People with access</h3>
        {people === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <ul className="space-y-1">
            {people.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                <Avatar name={p.name} color={p.color} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {p.name}
                    {p.userId === currentUserId && <span className="font-normal text-slate-500"> (you)</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{p.email}</span>
                </span>
                {isOwner && p.role !== "owner" ? (
                  <>
                    <select
                      value={p.role}
                      disabled={busy}
                      onChange={(e) => grant(p.email, e.target.value as ShareRole)}
                      aria-label={`Access for ${p.name}`}
                      className="rounded-md border border-slate-200 px-1.5 py-1 text-xs"
                    >
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                    <button type="button" disabled={busy} onClick={() => revoke(p.userId)} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                      Remove
                    </button>
                  </>
                ) : (
                  <RoleBadge role={p.role} />
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
          <span className="text-xs text-slate-500">Only people listed above can open the link.</span>
        </div>
      </div>
    </dialog>
  );
}
