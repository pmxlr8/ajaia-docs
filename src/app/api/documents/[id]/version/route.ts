import { getDocumentVersion } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** Cheap polling endpoint: open editors call this to notice saves by other people. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json(await getDocumentVersion(user.id, id));
});
