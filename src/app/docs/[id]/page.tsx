import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DocEditor } from "@/components/DocEditor";
import { getDocument, type DocDetail } from "@/lib/documents";
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
          <main className="mx-auto max-w-md flex-1 px-4 py-24 text-center">
            <h1 className="text-xl font-semibold">Document not available</h1>
            <p className="mt-2 text-sm text-slate-600">
              It does not exist, or it has not been shared with {user.email}. Ask the owner to share it, or switch user.
            </p>
            <Link href="/docs" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Back to documents
            </Link>
          </main>
        </>
      );
    }
    throw err;
  }

  const directory = (await listUsers()).filter((u) => u.id !== user.id).map((u) => ({ email: u.email, name: u.name }));

  return (
    <>
      <AppHeader user={user} />
      <DocEditor key={doc.id} doc={doc} userId={user.id} directory={directory} />
    </>
  );
}
