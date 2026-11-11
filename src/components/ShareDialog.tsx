"use client";

import { Check, Link2, Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ShareRole } from "@/lib/access";
import type { Collaborator } from "@/lib/documents";
import { api } from "./api";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";

type Props = {
  docId: string;
  docTitle: string;
  isOwner: boolean;
  ownerName: string;
  currentUserId: string;
  directory: { email: string; name: string }[];
  onClose: () => void;
  onChange?: (people: Collaborator[]) => void;
};

export function ShareDialog({ docId, docTitle, isOwner, ownerName, currentUserId, directory, onClose, onChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [people, setPeople] = useState<Collaborator[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    api<{ collaborators: Collaborator[] }>(`/api/documents/${docId}/shares`)
      .then((r) => setPeople(r.collaborators))
      .catch((e) => setError(e.message));
  }, [docId]);

  async function run(fn: () => Promise<{ collaborators: Collaborator[] }>, success: string) {
    setBusy(true);
    setError(null);
    try {
      const list = (await fn()).collaborators;
      setPeople(list);
      onChange?.(list);
      setFlash(success);
      setTimeout(() => setFlash((f) => (f === success ? null : f)), 2200);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const grant = (targetEmail: string, r: ShareRole) =>
    run(
      () => api(`/api/documents/${docId}/shares`, { method: "POST", json: { email: targetEmail, role: r } }),
      `${targetEmail} ${r === "editor" ? "can edit" : "can view"}`,
    );
  const revoke = (p: Collaborator) =>
    run(() => api(`/api/documents/${docId}/shares/${p.userId}`, { method: "DELETE" }), `Removed ${p.name}`);

  const taken = new Set(people?.map((p) => p.email));
  const suggestions = directory.filter((u) => !taken.has(u.email));

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-black/[0.08] bg-white p-0 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.18)]"
      aria-labelledby="share-title"
    >
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="share-title" className="text-base font-semibold tracking-tight">
              Share document
            </h2>
            <p className="truncate text-sm text-neutral-500">{docTitle}</p>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="-mr-1 -mt-1 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {isOwner ? (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
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
              className="h-9 min-w-0 flex-1 rounded-lg border border-black/[0.1] bg-white px-3 text-sm transition-colors placeholder:text-neutral-400 hover:border-black/20 focus:border-neutral-900 focus:outline-none"
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
              className="h-9 rounded-lg border border-black/[0.1] bg-white px-2.5 text-sm hover:border-black/20 focus:border-neutral-900 focus:outline-none"
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button type="submit" disabled={busy} className="btn btn-primary h-9">
              Share
            </button>
          </form>
        ) : (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
            <Lock size={14} className="text-neutral-400" aria-hidden />
            Only the owner ({ownerName}) can change who has access.
          </p>
        )}

        {error && (
          <p role="alert" className="animate-pop mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {flash && !error && (
          <p role="status" className="animate-pop mt-3 inline-flex items-center gap-1.5 text-[13px] text-neutral-600">
            <Check size={14} className="text-emerald-600" aria-hidden /> {flash}
          </p>
        )}
      </div>

      <div className="border-t border-black/[0.06] px-5 py-4">
        <h3 className="mb-2 text-xs font-medium text-neutral-500">People with access</h3>
        {people === null ? (
          <ul className="space-y-1" aria-busy>
            {[0, 1].map((i) => (
              <li key={i} className="flex animate-pulse items-center gap-3 py-2">
                <span className="h-8 w-8 rounded-full bg-neutral-100" />
                <span className="h-3 w-40 rounded bg-neutral-100" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="-mx-2">
            {people.map((p, i) => (
              <li
                key={p.userId}
                className="animate-enter flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-50"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <Avatar name={p.name} color={p.color} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">
                    {p.name}
                    {p.userId === currentUserId && <span className="font-normal text-neutral-500"> (you)</span>}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">{p.email}</span>
                </span>
                {isOwner && p.role !== "owner" ? (
                  <>
                    <select
                      value={p.role}
                      disabled={busy}
                      onChange={(e) => grant(p.email, e.target.value as ShareRole)}
                      aria-label={`Access for ${p.name}`}
                      className="h-7 rounded-md border border-black/[0.1] bg-white px-1.5 text-xs text-neutral-700 hover:border-black/20"
                    >
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => revoke(p)}
                      className="h-7 rounded-md px-2 text-xs text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
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
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-neutral-50/80 px-5 py-3">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="btn btn-secondary h-8 px-3 text-[13px]"
        >
          {copied ? <Check size={14} className="text-emerald-600" aria-hidden /> : <Link2 size={14} aria-hidden />}
          {copied ? "Link copied" : "Copy link"}
        </button>
        <span className="text-right text-xs text-neutral-500">Only people listed above can open the link.</span>
      </div>
    </dialog>
  );
}
