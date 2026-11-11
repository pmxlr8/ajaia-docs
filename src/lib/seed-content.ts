import type { JSONContent } from "@tiptap/core";

const text = (t: string, marks?: string[]): JSONContent => ({
  type: "text",
  text: t,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const li = (t: string): JSONContent => ({ type: "listItem", content: [p(text(t))] });

export const WELCOME_DOC: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Welcome to Ajaia Docs")] },
    p(
      text("This document is owned by "),
      text("Alice", ["bold"]),
      text(". It is shared with Bob as an "),
      text("editor", ["italic"]),
      text(" and with Carol as a "),
      text("viewer", ["underline"]),
      text("."),
    ),
    { type: "heading", attrs: { level: 2 }, content: [text("Try this")] },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        li("Sign in as Bob and edit this page. Changes save automatically."),
        li("Sign in as Carol. The page is read-only for her."),
        li("Sign in as Alice and open Share to change who has access."),
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [text("Formatting")] },
    {
      type: "bulletList",
      content: [li("Bold, italic, underline and strikethrough"), li("Headings H1 to H3"), li("Bulleted and numbered lists, quotes and code blocks")],
    },
  ],
};
