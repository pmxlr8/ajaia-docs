import type { Role } from "@/lib/access";

const LABELS: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" };
const DOT: Record<Role, string> = { owner: "bg-neutral-900", editor: "bg-emerald-500", viewer: "bg-neutral-400" };

/** Quiet status label: a small dot does the color work, not the whole pill. */
export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-2 py-0.5 text-xs font-medium text-neutral-700">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[role]}`} aria-hidden />
      {LABELS[role]}
    </span>
  );
}
