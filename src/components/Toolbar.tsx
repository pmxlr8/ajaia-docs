"use client";

import { useEditorState, type Editor } from "@tiptap/react";

type Btn = { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode };

function ToolButton({ label, shortcut, active, disabled, onClick, icon }: Btn) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm transition disabled:opacity-40 ${
        active ? "bg-blue-100 text-blue-800" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {icon}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;

const svg = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const mod = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      <ToolButton label="Undo" shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()} icon={svg("M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3")} />
      <ToolButton label="Redo" shortcut={`${mod}Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()} icon={svg("m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3")} />
      <Divider />
      <select
        aria-label="Text style"
        value={s.block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
        }}
        className="h-8 rounded-md border border-transparent bg-transparent px-1.5 text-sm text-slate-700 hover:bg-slate-100 focus:border-slate-300"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Divider />
      <ToolButton label="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()} icon={<span className="font-bold">B</span>} />
      <ToolButton label="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => chain().toggleItalic().run()} icon={<span className="font-serif italic">I</span>} />
      <ToolButton label="Underline" shortcut={`${mod}U`} active={s.underline} onClick={() => chain().toggleUnderline().run()} icon={<span className="underline">U</span>} />
      <ToolButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} icon={<span className="line-through">S</span>} />
      <Divider />
      <ToolButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()} icon={svg("M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01")} />
      <ToolButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} icon={svg("M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1")} />
      <ToolButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} icon={svg("M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6")} />
      <ToolButton label="Code block" active={s.code} onClick={() => chain().toggleCodeBlock().run()} icon={svg("m8 8-4 4 4 4M16 8l4 4-4 4")} />
      <Divider />
      <ToolButton label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()} icon={svg("M4 7V5h11v2M9 5l-2 14M13 13l6 6M19 13l-6 6")} />
    </div>
  );
}
