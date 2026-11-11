import type { JSONContent } from "@tiptap/core";

/**
 * ProseMirror JSON -> Markdown, for "Export as Markdown".
 * Covers every node and mark in the shared schema. Underline has no Markdown
 * syntax, so it is written as <u>…</u>, which most renderers support.
 */
export function toMarkdown(doc: JSONContent): string {
  return blocks(doc.content ?? []).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function blocks(nodes: JSONContent[], sep = "\n\n"): string {
  return nodes.map(block).join(sep);
}

function block(node: JSONContent): string {
  switch (node.type) {
    case "paragraph":
      return inline(node.content);
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inline(node.content)}`;
    case "bulletList":
      return list(node, () => "- ");
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return list(node, (i) => `${start + i}. `);
    }
    case "blockquote":
      return blocks(node.content ?? [])
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "codeBlock": {
      const lang = (node.attrs?.language as string | null) ?? "";
      const text = (node.content ?? []).map((t) => t.text ?? "").join("");
      return "```" + lang + "\n" + text + "\n```";
    }
    case "horizontalRule":
      return "---";
    default:
      return node.content ? blocks(node.content) : "";
  }
}

function list(node: JSONContent, marker: (i: number) => string): string {
  return (node.content ?? [])
    .map((item, i) => {
      const m = marker(i);
      const pad = " ".repeat(m.length);
      return blocks(item.content ?? [], "\n")
        .split("\n")
        .map((line, j) => (j === 0 ? m + line : line ? pad + line : ""))
        .join("\n");
    })
    .join("\n");
}

function inline(nodes?: JSONContent[]): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type !== "text") return "";
      return withMarks(n.text ?? "", n.marks ?? []);
    })
    .join("");
}

function withMarks(text: string, marks: NonNullable<JSONContent["marks"]>): string {
  const has = (type: string) => marks.find((m) => m.type === type);
  // Keep surrounding spaces outside the markers: "**bold **" is not valid Markdown.
  const [, lead, core, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? ["", "", text, ""];
  if (!core) return text;
  let s = has("code") ? "`" + core + "`" : escape(core);
  if (has("underline")) s = `<u>${s}</u>`;
  if (has("strike")) s = `~~${s}~~`;
  if (has("italic")) s = `*${s}*`;
  if (has("bold")) s = `**${s}**`;
  const link = has("link");
  if (link) s = `[${s}](${String(link.attrs?.href ?? "")})`;
  return lead + s + trail;
}

function escape(s: string): string {
  return s.replace(/[\\`*_[\]<>]/g, (c) => "\\" + c);
}

/** File-system friendly name for downloads. */
export function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}
