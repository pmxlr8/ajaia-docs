import StarterKit from "@tiptap/starter-kit";

/**
 * The single source of truth for the document schema.
 * The browser editor, server-side validation and file import all build their
 * ProseMirror schema from this list, so stored JSON always matches what the
 * editor can render.
 */
export const baseExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true },
  }),
];
