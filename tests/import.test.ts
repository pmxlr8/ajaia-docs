import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importFile } from "@/lib/import";
import { AppError } from "@/lib/errors";

type Node = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: Node[] };
const types = (n: Node): string[] => [n.type, ...(n.content ?? []).flatMap(types)];
const marks = (n: Node): string[] => [...(n.marks ?? []).map((m) => m.type), ...(n.content ?? []).flatMap(marks)];

describe("file import", () => {
  it("turns Markdown into headings, marks and lists", async () => {
    const md = "# Launch plan\n\nShip **fast** and _carefully_.\n\n- one\n- two\n\n1. first\n2. second\n";
    const { title, content } = await importFile("launch_plan.md", Buffer.from(md));
    expect(title).toBe("launch plan");
    const doc = content as Node;
    expect(doc.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(types(doc)).toEqual(expect.arrayContaining(["bulletList", "orderedList", "listItem"]));
    expect(marks(doc)).toEqual(expect.arrayContaining(["bold", "italic"]));
  });

  it("turns a Word file (built with python-docx) into headings, marks and lists", async () => {
    const buf = readFileSync(new URL("./fixtures/quarterly-review.docx", import.meta.url));
    const { title, content } = await importFile("quarterly-review.docx", buf);
    expect(title).toBe("quarterly review");
    const doc = content as Node;
    expect(doc.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(doc.content?.find((n) => n.type === "heading" && n.attrs?.level === 2)).toBeTruthy();
    expect(types(doc)).toEqual(expect.arrayContaining(["bulletList", "orderedList"]));
    expect(marks(doc)).toEqual(expect.arrayContaining(["bold", "italic", "underline"]));
  });

  it("shows raw HTML in Markdown as text instead of running it", async () => {
    const { content } = await importFile("x.md", Buffer.from("<script>alert(1)</script>\n\nhello"));
    const json = JSON.stringify(content);
    expect(json).not.toContain('"type":"script"');
    expect(json).toContain("alert(1)");
  });

  it("turns plain text paragraphs into paragraphs", async () => {
    const { content } = await importFile("notes.txt", Buffer.from("line one\nline two\n\nsecond <para>"));
    const doc = content as Node;
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    expect(types(doc)).toContain("hardBreak");
    expect(JSON.stringify(doc)).toContain("second <para>");
  });

  it("rejects unsupported, empty and broken files", async () => {
    const code = async (name: string, buf: Buffer) => {
      try {
        await importFile(name, buf);
      } catch (e) {
        return (e as AppError).code;
      }
      return "no error";
    };
    expect(await code("image.png", Buffer.from("x"))).toBe("unsupported_type");
    expect(await code("empty.txt", Buffer.alloc(0))).toBe("empty_file");
    expect(await code("big.txt", Buffer.alloc(3 * 1024 * 1024, 97))).toBe("file_too_large");
    expect(await code("fake.docx", Buffer.from("not a zip"))).toBe("unreadable_file");
  });
});
