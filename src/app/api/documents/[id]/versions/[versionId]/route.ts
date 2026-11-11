import { z } from "zod";
import { getVersion, restoreVersion } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, versionId } = await params;
  return Response.json(await getVersion(user.id, id, versionId));
});

const RestoreBody = z.object({ baseVersion: z.number().int().positive() }).strict();

/** Restore this version as the current content (a normal save, with the usual conflict check). */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id, versionId } = await params;
  const { baseVersion } = RestoreBody.parse(await req.json());
  return Response.json(await restoreVersion(user.id, id, versionId, baseVersion));
});
