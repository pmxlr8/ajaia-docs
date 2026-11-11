import Link from "next/link";
import { signOut } from "@/app/actions";
import type { User } from "@/lib/users";
import { Avatar } from "./Avatar";
import { BrandMark } from "./Brand";

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.08] bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/docs" className="flex items-center gap-2.5 rounded-md" aria-label="All documents">
          <BrandMark size={24} />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Ajaia Docs</span>
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Avatar name={user.name} color={user.color} size={24} />
          <span className="hidden text-sm text-neutral-700 md:inline">{user.name}</span>
          <span className="mx-1 hidden h-4 w-px bg-black/10 md:block" aria-hidden />
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost h-8 px-2.5 text-[13px]">
              Switch user
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
