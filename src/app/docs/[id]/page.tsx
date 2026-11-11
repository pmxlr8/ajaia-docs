import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DocEditor } from "@/components/DocEditor";
import { getDocument, listCollaborators, type DocDetail } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { getSessionUser } from "@/lib/session";
import { listUsers } from "@/lib/users";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/docs/${id}`)}`);

  let doc: DocDetail;
  try {
    doc = await getDocument(user.id, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) {
      return (
        <>
          <AppHeader user={user} />
          <main className="animate-enter mx-auto max-w-md flex-1 px-4 py-24 text-center">
            <p className="font-mono text-xs text-neutral-400">404</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Document not available</h1>
            <p className="mt-2 text-sm text-neutral-500">
              It does not exist, or it has not been shared with {user.email}. Ask the owner to share it, or switch user.
            </p>
            <Link href="/docs" className="btn btn-primary mt-6">
              Back to documents
            </Link>
          </main>
        </>
      );
    }
    throw err;
  }

  const [users, collaborators] = await Promise.all([listUsers(), listCollaborators(user.id, id)]);
  const directory = users.filter((u) => u.id !== user.id).map((u) => ({ email: u.email, name: u.name }));

  return (
    <>
      <AppHeader user={user} />
      <DocEditor key={doc.id} doc={doc} userId={user.id} directory={directory} collaborators={collaborators} />
    </>
  );
}
