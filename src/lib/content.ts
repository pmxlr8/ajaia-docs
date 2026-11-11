import { getSchema, type JSONContent } from "@tiptap/core";
import { baseExtensions } from "./editor/extensions";
import { AppError } from "./errors";

const schema = getSchema(baseExtensions);

export const MAX_CONTENT_BYTES = 1_000_000;

export const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Validate untrusted document JSON against the editor schema.
 * Rejects unknown node/mark types, bad nesting and oversized payloads, and
 * returns a normalized copy. This is the server-side guard that keeps the
 * database free of content the editor cannot render.
 */
export function validateContent(content: unknown): JSONContent {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new AppError(400, "invalid_content", "Document content must be a JSON object.");
  }
  const size = Buffer.byteLength(JSON.stringify(content), "utf8");
  if (size > MAX_CONTENT_BYTES) {
    throw new AppError(413, "content_too_large", "This document is too large to save (limit is about 1 MB).");
  }
  try {
    const node = schema.nodeFromJSON(content);
    if (node.type.name !== "doc") throw new Error("root must be doc");
    node.check();
    return node.toJSON() as JSONContent;
  } catch {
    throw new AppError(400, "invalid_content", "Document content does not match the editor format.");
  }
}
