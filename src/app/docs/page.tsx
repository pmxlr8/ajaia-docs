import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DashboardActions, DeleteDocButton } from "@/components/DashboardActions";
import { RoleBadge } from "@/components/RoleBadge";
import { TimeAgo } from "@/components/TimeAgo";
import { listDocuments, type DocSummary } from "@/lib/documents";
import { getSessionUser } from "@/lib/session";

export default async function DocsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { owned, shared } = await listDocuments(user.id);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
            <p className="mt-1 text-sm text-slate-600">Signed in as {user.email}</p>
          </div>
          <DashboardActions />
        </div>

        <Section
          title="My documents"
          count={owned.length}
          empty="You have no documents yet. Create one, or import a file."
          docs={owned}
          kind="owned"
        />
        <Section
          title="Shared with me"
          count={shared.length}
          empty="Nothing is shared with you yet. When someone shares a document, it shows up here."
          docs={shared}
          kind="shared"
        />
      </main>
    </>
  );
}

function Section(props: { title: string; count: number; empty: string; docs: DocSummary[]; kind: "owned" | "shared" }) {
  return (
    <section className="mb-10" aria-labelledby={`${props.kind}-heading`}>
      <h2 id={`${props.kind}-heading`} className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {props.title}
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{props.count}</span>
      </h2>
      {props.docs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">{props.empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {props.docs.map((d) => (
            <li key={d.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <DocIcon />
              <Link href={`/docs/${d.id}`} className="min-w-0 flex-1 focus:outline-none">
                <span className="block truncate font-medium text-slate-900 group-hover:text-blue-700">{d.title}</span>
                <span className="block truncate text-xs text-slate-500">
                  {props.kind === "shared" ? `Owner: ${d.ownerName}` : d.shareCount > 0 ? `Shared with ${d.shareCount} ${d.shareCount === 1 ? "person" : "people"}` : "Private"}
                  {" · Edited "}
                  <TimeAgo iso={d.updatedAt} />
                </span>
              </Link>
              <RoleBadge role={d.role} />
              {props.kind === "owned" && <DeleteDocButton id={d.id} title={d.title} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocIcon() {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
    </span>
  );
}
