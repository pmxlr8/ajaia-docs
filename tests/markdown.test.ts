import { describe, expect, it } from "vitest";
import { importFile } from "@/lib/import";
import { fileSlug, toMarkdown } from "@/lib/markdown";

const t = (text: string, ...marks: string[]) => ({ type: "text", text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...content: object[]) => ({ type: "paragraph", content });

describe("Markdown export", () => {
  it("writes headings, marks, lists, quotes and code", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [t("Plan")] },
        p(t("Ship "), t("fast ", "bold"), t("and "), t("carefully", "italic"), t(", "), t("tested", "underline"), t(".")),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [p(t("one")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("nested"))] }] }] },
            { type: "listItem", content: [p(t("two"))] },
          ],
        },
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p(t("first"))] }] },
        { type: "blockquote", content: [p(t("quoted"))] },
        { type: "codeBlock", attrs: { language: "js" }, content: [t("const a = 1 * 2;")] },
      ],
    };
    expect(toMarkdown(doc)).toBe(
      [
        "## Plan",
        "",
        "Ship **fast** and *carefully*, <u>tested</u>.",
        "",
        "- one",
        "  - nested",
        "- two",
        "",
        "1. first",
        "",
        "> quoted",
        "",
        "```js",
        "const a = 1 * 2;",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("escapes Markdown characters in plain text", () => {
    expect(toMarkdown({ type: "doc", content: [p(t("2 * 3 = [six]"))] })).toBe("2 \\* 3 = \\[six\\]\n");
  });

  it("round-trips through the Markdown importer without losing structure", async () => {
    const source = "# Launch plan\n\nShip **fast** and *carefully*.\n\n- one\n- two\n\n1. first\n2. second\n\n> note\n";
    const first = await importFile("a.md", Buffer.from(source));
    const second = await importFile("a.md", Buffer.from(toMarkdown(first.content)));
    expect(second.content).toEqual(first.content);
  });

  it("makes safe file names", () => {
    expect(fileSlug("Q4 Launch: Plan / Draft!")).toBe("q4-launch-plan-draft");
    expect(fileSlug("   ")).toBe("document");
  });
});
