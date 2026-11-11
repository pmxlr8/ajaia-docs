import { z } from "zod";
import { addComment, listComments, MAX_COMMENT_LENGTH } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json({ comments: await listComments(user.id, id) });
});

const NewComment = z
  .object({ body: z.string().max(MAX_COMMENT_LENGTH * 2), quote: z.string().max(5000).nullish() })
  .strict();

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { body, quote } = NewComment.parse(await req.json());
  return Response.json(await addComment(user.id, id, body, quote), { status: 201 });
});
