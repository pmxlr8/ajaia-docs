import { z } from "zod";
import { deleteDocument, getDocument, renameDocument, updateContent } from "@/lib/documents";
import { badRequest, route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json(await getDocument(user.id, id));
});

/** PATCH accepts a rename ({ title }) and/or a content save ({ content, baseVersion }). */
const PatchBody = z
  .object({
    title: z.string().optional(),
    content: z.unknown().optional(),
    baseVersion: z.number().int().positive().optional(),
  })
  .strict();

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = PatchBody.parse(await req.json());
  if (body.title === undefined && body.content === undefined) throw badRequest("Nothing to update.");
  if (body.content !== undefined && body.baseVersion === undefined) {
    throw badRequest("baseVersion is required when saving content.");
  }

  const result: Record<string, unknown> = {};
  if (body.title !== undefined) Object.assign(result, await renameDocument(user.id, id, body.title));
  if (body.content !== undefined) Object.assign(result, await updateContent(user.id, id, body.content, body.baseVersion!));
  return Response.json(result);
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteDocument(user.id, id);
  return new Response(null, { status: 204 });
});
