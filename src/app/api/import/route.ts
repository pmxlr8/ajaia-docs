import { createDocument } from "@/lib/documents";
import { AppError, badRequest, route } from "@/lib/errors";
import { importFile, MAX_UPLOAD_BYTES } from "@/lib/import";
import { requireUser } from "@/lib/session";

/** Upload a .txt / .md / .docx file (multipart field "file") and create a new document from it. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => {
    throw badRequest("Send the file as multipart/form-data in a field named 'file'.");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was uploaded.", "missing_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, "file_too_large", "Files must be 2 MB or smaller.");

  const { title, content } = await importFile(file.name, Buffer.from(await file.arrayBuffer()));
  const doc = await createDocument(user.id, { title, content });
  return Response.json(doc, { status: 201 });
});
