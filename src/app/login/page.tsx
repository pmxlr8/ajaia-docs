import { ArrowRight, FileUp, Lock, PenLine, ShieldCheck, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { signIn } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { BrandMark } from "@/components/Brand";
import { getSessionUser } from "@/lib/session";
import { listUsers } from "@/lib/users";

const HINTS: Record<string, string> = {
  u_alice: "Owner",
  u_bob: "Editor",
  u_carol: "Viewer",
};

const FEATURES = [
  { icon: PenLine, title: "Rich text, autosaved", body: "Headings, lists and marks. Saves as you type." },
  { icon: Users, title: "Real sharing", body: "Owners, editors and viewers, enforced on the server." },
  { icon: ShieldCheck, title: "No silent overwrites", body: "Stale saves are caught, and you choose what to keep." },
  { icon: FileUp, title: "Bring your files", body: "Import .docx, .md and .txt as editable documents." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const current = await getSessionUser();
  if (current && !next) redirect("/docs");
  const users = await listUsers();

  return (
    <main className="flex flex-1 items-center">
      <div className="mx-auto grid w-full max-w-5xl gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_400px] lg:items-center lg:gap-20">
        <section className="animate-enter">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="text-[15px] font-semibold tracking-tight">Ajaia Docs</span>
          </div>
          <h1 className="mt-10 max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-neutral-950 sm:text-5xl">
            Write together.
            <br />
            <span className="text-neutral-400">Share with intent.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-neutral-600">
            A focused document editor: real sharing, autosave you can trust, and no lost work when two people edit.
          </p>
          <dl className="mt-12 grid max-w-lg gap-x-10 gap-y-7 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="animate-enter" style={{ animationDelay: `${80 + i * 40}ms` }}>
                <dt className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                  <f.icon size={15} className="text-neutral-500" aria-hidden />
                  {f.title}
                </dt>
                <dd className="mt-1 pl-[23px] text-sm leading-snug text-neutral-500">{f.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className="animate-enter rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-7"
          style={{ animationDelay: "60ms" }}
        >
          <h2 className="text-base font-semibold tracking-tight">Choose a demo account</h2>
          <p className="mt-1 text-sm text-neutral-500">Sign in as different people to try sharing. No password needed.</p>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              That account does not exist. Choose one below.
            </p>
          )}

          <ul className="mt-5 divide-y divide-black/[0.06] overflow-hidden rounded-lg border border-black/[0.08]">
            {users.map((u) => (
              <li key={u.id}>
                <form action={signIn}>
                  <input type="hidden" name="userId" value={u.id} />
                  {next && <input type="hidden" name="next" value={next} />}
                  <button
                    type="submit"
                    className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-offset-[-2px]"
                  >
                    <Avatar name={u.name} color={u.color} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-neutral-900">{u.name}</span>
                      <span className="block truncate text-[13px] text-neutral-500">{u.email}</span>
                    </span>
                    <span className="hidden font-mono text-[11px] uppercase tracking-wider text-neutral-400 sm:block">
                      {HINTS[u.id] ?? "Member"}
                    </span>
                    <ArrowRight
                      size={16}
                      className="shrink-0 text-neutral-300 transition duration-150 group-hover:translate-x-0.5 group-hover:text-neutral-900"
                      aria-hidden
                    />
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">Roles shown are for the seeded welcome document.</p>

          <p className="mt-6 flex items-center gap-1.5 border-t border-black/[0.06] pt-4 text-xs text-neutral-500">
            <Lock size={12} aria-hidden />
            Demo sign-in. Sessions use a signed, httpOnly cookie.
          </p>
        </section>
      </div>
    </main>
  );
}
