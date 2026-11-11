import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Dashboard } from "@/components/Dashboard";
import { listDocuments } from "@/lib/documents";
import { getSessionUser } from "@/lib/session";

export default async function DocsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { owned, shared } = await listDocuments(user.id);

  return (
    <>
      <AppHeader user={user} />
      <Dashboard firstName={user.name.split(" ")[0]} email={user.email} owned={owned} shared={shared} />
    </>
  );
}
