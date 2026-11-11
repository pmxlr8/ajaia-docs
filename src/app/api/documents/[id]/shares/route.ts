import { z } from "zod";
import { listCollaborators, shareDocument } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json({ collaborators: await listCollaborators(user.id, id) });
});

const ShareBody = z.object({
  email: z.string().trim().min(1, "Enter an email address.").max(320),
  role: z.enum(["editor", "viewer"]),
});

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { email, role } = ShareBody.parse(await req.json());
  return Response.json({ collaborators: await shareDocument(user.id, id, email, role) });
});
