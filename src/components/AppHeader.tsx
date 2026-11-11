import Link from "next/link";
import { signOut } from "@/app/actions";
import type { User } from "@/lib/users";
import { Avatar } from "./Avatar";

export function AppHeader({ user, children }: { user: User; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/docs" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="All documents">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
          </span>
          <span className="hidden sm:inline">Ajaia Docs</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        <div className="flex items-center gap-2">
          <Avatar name={user.name} color={user.color} />
          <span className="hidden text-sm text-slate-700 md:inline">{user.name}</span>
          <form action={signOut}>
            <button type="submit" className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              Switch user
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
