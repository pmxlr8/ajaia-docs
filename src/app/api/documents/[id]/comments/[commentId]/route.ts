import { z } from "zod";
import { deleteComment, setCommentResolved } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

const Patch = z.object({ resolved: z.boolean() }).strict();

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id, commentId } = await params;
  const { resolved } = Patch.parse(await req.json());
  await setCommentResolved(user.id, id, commentId, resolved);
  return Response.json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, commentId } = await params;
  await deleteComment(user.id, id, commentId);
  return Response.json({ ok: true });
});
