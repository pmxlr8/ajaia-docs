import type { Role } from "@/lib/access";

const STYLES: Record<Role, string> = {
  owner: "bg-blue-50 text-blue-700 ring-blue-200",
  editor: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  viewer: "bg-slate-100 text-slate-700 ring-slate-200",
};

const LABELS: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[role]}`}>
      {LABELS[role]}
    </span>
  );
}
