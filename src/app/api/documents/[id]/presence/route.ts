import { z } from "zod";
import { heartbeat } from "@/lib/documents";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ editing: z.boolean().default(false) }).strict();

/** Editor heartbeat: marks the user as present and returns the latest version and who else is here. */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { editing } = Body.parse(await req.json().catch(() => ({})));
  return Response.json(await heartbeat(user.id, id, editing));
});
