import { z } from "zod";
import { createDocument, listDocuments } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json(await listDocuments(user.id));
});

const CreateBody = z.object({ title: z.string().max(500).optional() }).strict();

export const POST = route(async (req) => {
  const user = await requireUser();
  const text = await req.text();
  const body = CreateBody.parse(text ? JSON.parse(text) : {});
  const doc = await createDocument(user.id, { title: body.title });
  return Response.json(doc, { status: 201 });
});
