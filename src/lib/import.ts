/**
 * File import: turn an uploaded .txt, .md or .docx file into editor JSON.
 * Pipeline: file -> HTML -> ProseMirror JSON (via the shared schema) -> validate.
 * Anything the schema does not know (images, tables, scripts, styles) is dropped
 * by the schema parser, which also makes the import safe against HTML injection.
 */
import type { JSONContent } from "@tiptap/core";
import { generateJSON } from "@tiptap/html/server";
import mammoth from "mammoth";
import { Marked } from "marked";
import { validateContent } from "./content";
import { baseExtensions } from "./editor/extensions";
import { AppError } from "./errors";
import { normalizeTitle } from "./documents";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Raw HTML inside Markdown is shown as text, not interpreted.
const markdown = new Marked({ gfm: true, async: false });
markdown.use({ renderer: { html: (token) => escapeHtml(token.text) } });

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function fileToHtml(ext: string, buf: Buffer): Promise<string> {
  if (ext === ".docx") {
    try {
      const result = await mammoth.convertToHtml(
        { buffer: buf },
        {
          styleMap: ["u => u"],
          // We do not support images; skip embedding them as base64.
          convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
        },
      );
      return result.value;
    } catch {
      throw new AppError(422, "unreadable_file", "We could not read this .docx file. Is it a valid Word document?");
    }
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  if (ext === ".md" || ext === ".markdown") return markdown.parse(text) as string;
  return textToHtml(text);
}

export async function importFile(filename: string, buf: Buffer): Promise<{ title: string; content: JSONContent }> {
  const ext = extensionOf(filename);
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new AppError(415, "unsupported_type", "Unsupported file type. Upload a .txt, .md or .docx file.");
  }
  if (buf.length === 0) throw new AppError(400, "empty_file", "The file is empty.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new AppError(413, "file_too_large", "Files must be 2 MB or smaller.");

  const html = await fileToHtml(ext, buf);
  const json = generateJSON(html || "<p></p>", baseExtensions);
  const content = validateContent(json);
  const title = normalizeTitle(filename.slice(0, filename.length - ext.length).replace(/[_-]+/g, " "));
  return { title, content };
}
