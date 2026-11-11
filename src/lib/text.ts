type Node = { type?: string; text?: string; content?: Node[] };

/** Plain-text preview of editor JSON: block texts joined by spaces, cut to `max` characters. */
export function snippetOf(doc: unknown, max = 220): string {
  const blocks: string[] = [];
  let total = 0;

  const textOf = (n: Node): string => (n.type === "text" ? (n.text ?? "") : (n.content ?? []).map(textOf).join(""));
  const walk = (n: Node) => {
    if (total >= max) return;
    const kids = n.content ?? [];
    const isTextBlock = kids.length > 0 && kids.every((k) => k.type === "text" || k.type === "hardBreak");
    if (isTextBlock || n.type === "paragraph" || n.type === "heading") {
      const t = textOf(n).trim();
      if (t) {
        blocks.push(t);
        total += t.length + 1;
      }
      return;
    }
    kids.forEach(walk);
  };

  walk((doc ?? {}) as Node);
  const joined = blocks.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > max ? `${joined.slice(0, max - 1).trimEnd()}…` : joined;
}
