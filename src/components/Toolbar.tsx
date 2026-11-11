"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  CodeXml,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";

type Btn = { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; icon: LucideIcon };

function ToolButton({ label, shortcut, active, disabled, onClick, icon: Icon }: Btn) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-30 ${
        active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      <Icon size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px bg-black/10" aria-hidden />;

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
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-black/[0.08] bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <ToolButton label="Undo" shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()} icon={Undo2} />
      <ToolButton label="Redo" shortcut={`${mod}Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()} icon={Redo2} />
      <Divider />
      <label className="relative inline-flex items-center">
        <select
          aria-label="Text style"
          value={s.block}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") chain().setParagraph().run();
            else chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
          }}
          className="h-8 cursor-pointer appearance-none rounded-md bg-transparent pl-2.5 pr-7 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 text-neutral-400" aria-hidden />
      </label>
      <Divider />
      <ToolButton label="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()} icon={Bold} />
      <ToolButton label="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => chain().toggleItalic().run()} icon={Italic} />
      <ToolButton label="Underline" shortcut={`${mod}U`} active={s.underline} onClick={() => chain().toggleUnderline().run()} icon={Underline} />
      <ToolButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} icon={Strikethrough} />
      <Divider />
      <ToolButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()} icon={List} />
      <ToolButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} icon={ListOrdered} />
      <ToolButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} icon={Quote} />
      <ToolButton label="Code block" active={s.code} onClick={() => chain().toggleCodeBlock().run()} icon={CodeXml} />
      <Divider />
      <ToolButton label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()} icon={RemoveFormatting} />
    </div>
  );
}
