import { redirect } from "next/navigation";
import { signIn } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { getSessionUser } from "@/lib/session";
import { listUsers } from "@/lib/users";

const HINTS: Record<string, string> = {
  u_alice: "Owns the welcome doc",
  u_bob: "Editor on the welcome doc",
  u_carol: "Viewer on the welcome doc",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const current = await getSessionUser();
  if (current && !next) redirect("/docs");
  const users = await listUsers();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in to Ajaia Docs</h1>
          <p className="mt-2 text-sm text-slate-600">
            Pick a demo account. Sign in as different people to try sharing.
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            That account does not exist. Choose one below.
          </p>
        )}

        <ul className="space-y-3">
          {users.map((u) => (
            <li key={u.id}>
              <form action={signIn}>
                <input type="hidden" name="userId" value={u.id} />
                {next && <input type="hidden" name="next" value={next} />}
                <button
                  type="submit"
                  className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-400 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Avatar name={u.name} color={u.color} size={40} />
                  <span className="flex-1">
                    <span className="block font-medium">{u.name}</span>
                    <span className="block text-sm text-slate-500">{u.email}</span>
                  </span>
                  <span className="hidden text-xs text-slate-500 sm:block">{HINTS[u.id]}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-xs text-slate-500">
          Demo sign-in only: no passwords. Sessions use a signed, httpOnly cookie.
        </p>
      </div>
    </main>
  );
}

function Logo() {
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
    </span>
  );
}
