import { revokeShare } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, userId } = await params;
  return Response.json({ collaborators: await revokeShare(user.id, id, userId) });
});
