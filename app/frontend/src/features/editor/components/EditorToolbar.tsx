import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import type { PaperSize } from "../extensions/pagination";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo2,
  Redo2,
  Highlighter,
  RemoveFormatting,
  Minus,
  Link2,
  Image as ImageIcon,
  CheckSquare,
  Table as TableIcon,
} from "lucide-react";

/**
 * Props for the EditorToolbar component.
 */
export interface EditorToolbarProps {
  /** The Tiptap editor instance to control. */
  editor: Editor;
  /** The current paper size */
  paper_size?: PaperSize;
  /** Function to change paper size */
  set_paper_size?: (size: PaperSize) => void;
}

/**
 * Props for a single toolbar button.
 */
interface ToolbarButtonProps {
  /** Click handler. */
  on_click: () => void;
  /** Whether this formatting option is currently active. */
  is_active?: boolean;
  /** Whether the button is disabled. */
  is_disabled?: boolean;
  /** Accessible label for the button. */
  aria_label: string;
  /** Keyboard shortcut hint displayed in tooltip. */
  shortcut?: string;
  /** Icon element to render. */
  children: React.ReactNode;
}

/**
 * Individual toolbar button with active state styling.
 * Follows FRONTEND.md §12 interactive states.
 */
function ToolbarButton({
  on_click,
  is_active = false,
  is_disabled = false,
  aria_label,
  shortcut,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={on_click}
      disabled={is_disabled}
      className={[
        "inline-flex items-center justify-center",
        "h-8 w-8 rounded-[4px]",
        "transition-all duration-[100ms] ease-in-out",
        "cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        is_active
          ? "bg-accent-main/10 text-accent-main"
          : "text-text-secondary hover:text-text-primary hover:bg-surface",
      ].join(" ")}
      aria-label={aria_label}
      title={shortcut ? `${aria_label} (${shortcut})` : aria_label}
    >
      {children}
    </button>
  );
}

/**
 * Visual separator between toolbar button groups.
 */
function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-border-subtle" />;
}

/**
 * Font family selector dropdown.
 */
function FontFamilySelect({ editor }: { editor: Editor }) {
  const current_font = editor.getAttributes("textStyle").fontFamily || "";

  const handle_change = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === "") {
        editor.chain().focus().unsetFontFamily().run();
      } else {
        editor.chain().focus().setFontFamily(value).run();
      }
    },
    [editor],
  );

  return (
    <select
      value={current_font}
      onChange={handle_change}
      className="h-8 rounded-[4px] border border-border-subtle bg-surface px-2 text-ui-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent-main focus:ring-1 focus:ring-accent-main/40"
      aria-label="Font family"
      title="Font family"
    >
      <option value="" className="bg-surface text-text-primary">Default (Merriweather)</option>
      <option value="Inter" className="bg-surface text-text-primary">Inter</option>
      <option value="Georgia" className="bg-surface text-text-primary">Georgia</option>
      <option value="Arial" className="bg-surface text-text-primary">Arial</option>
      <option value="Times New Roman" className="bg-surface text-text-primary">Times New Roman</option>
      <option value="Courier New" className="bg-surface text-text-primary">Courier New</option>
      <option value="Verdana" className="bg-surface text-text-primary">Verdana</option>
    </select>
  );
}

/**
 * Paper size selector dropdown.
 */
function PaperSizeSelect({ 
  value, 
  on_change 
}: { 
  value: PaperSize, 
  on_change: (val: PaperSize) => void 
}) {
  return (
    <select
      value={value}
      onChange={(e) => on_change(e.target.value as PaperSize)}
      className="h-8 rounded-[4px] border border-border-subtle bg-surface px-2 text-ui-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent-main focus:ring-1 focus:ring-accent-main/40"
      aria-label="Paper size"
      title="Paper size"
    >
      <option value="a4" className="bg-surface text-text-primary">A4</option>
      <option value="letter" className="bg-surface text-text-primary">Letter</option>
      <option value="a3" className="bg-surface text-text-primary">A3</option>
    </select>
  );
}

/**
 * Rich formatting toolbar for the Tiptap editor.
 *
 * Provides visible buttons for all common formatting operations:
 * bold, italic, underline, strikethrough, headings, lists,
 * blockquote, code, text alignment, highlight, undo/redo.
 *
 * Follows FRONTEND.md §10 (Context Menu actions) and §7 (icon sizes).
 * Positioned at the top of the document surface, inside the editor
 * sheet container.
 */
export function EditorToolbar({ editor, paper_size = "a4", set_paper_size }: EditorToolbarProps) {
  const add_link = useCallback(() => {
    const previous_url = editor.getAttributes("link").href;
    const url = window.prompt("URL", previous_url);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const add_image = useCallback(() => {
    const url = window.prompt("Image URL");

    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insert_table = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  return (
    <div
      className="ui-peripheral flex flex-wrap items-center gap-0.5 px-3 py-1.5 w-full bg-surface"
      role="toolbar"
      aria-label="Formatting toolbar"
    >
      {/* Undo / Redo */}
      <ToolbarButton
        on_click={() => editor.chain().focus().undo().run()}
        is_disabled={!editor.can().undo()}
        aria_label="Undo"
        shortcut="Ctrl+Z"
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().redo().run()}
        is_disabled={!editor.can().redo()}
        aria_label="Redo"
        shortcut="Ctrl+Y"
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Page Setup */}
      {set_paper_size && (
        <>
          <PaperSizeSelect value={paper_size} on_change={set_paper_size} />
          <ToolbarDivider />
        </>
      )}

      {/* Font family */}
      <FontFamilySelect editor={editor} />

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleBold().run()}
        is_active={editor.isActive("bold")}
        aria_label="Bold"
        shortcut="Ctrl+B"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleItalic().run()}
        is_active={editor.isActive("italic")}
        aria_label="Italic"
        shortcut="Ctrl+I"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleUnderline().run()}
        is_active={editor.isActive("underline")}
        aria_label="Underline"
        shortcut="Ctrl+U"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleStrike().run()}
        is_active={editor.isActive("strike")}
        aria_label="Strikethrough"
        shortcut="Ctrl+Shift+S"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleHighlight().run()}
        is_active={editor.isActive("highlight")}
        aria_label="Highlight"
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        is_active={editor.isActive("heading", { level: 1 })}
        aria_label="Heading 1"
        shortcut="Ctrl+Alt+1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        is_active={editor.isActive("heading", { level: 2 })}
        aria_label="Heading 2"
        shortcut="Ctrl+Alt+2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        is_active={editor.isActive("heading", { level: 3 })}
        aria_label="Heading 3"
        shortcut="Ctrl+Alt+3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleBulletList().run()}
        is_active={editor.isActive("bulletList")}
        aria_label="Bullet list"
        shortcut="Ctrl+Shift+8"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleOrderedList().run()}
        is_active={editor.isActive("orderedList")}
        aria_label="Numbered list"
        shortcut="Ctrl+Shift+7"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block formatting */}
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleBlockquote().run()}
        is_active={editor.isActive("blockquote")}
        aria_label="Blockquote"
        shortcut="Ctrl+Shift+B"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleCodeBlock().run()}
        is_active={editor.isActive("codeBlock")}
        aria_label="Code block"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().setHorizontalRule().run()}
        aria_label="Horizontal rule"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().toggleTaskList().run()}
        is_active={editor.isActive("taskList")}
        aria_label="Task list"
        shortcut="Ctrl+Shift+9"
      >
        <CheckSquare className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Insert objects */}
      <ToolbarButton
        on_click={add_link}
        is_active={editor.isActive("link")}
        aria_label="Link"
        shortcut="Ctrl+K"
      >
        <Link2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={add_image}
        aria_label="Insert Image"
      >
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={insert_table}
        is_active={editor.isActive("table")}
        aria_label="Insert Table"
      >
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text alignment */}
      <ToolbarButton
        on_click={() => editor.chain().focus().setTextAlign("left").run()}
        is_active={editor.isActive({ textAlign: "left" })}
        aria_label="Align left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().setTextAlign("center").run()}
        is_active={editor.isActive({ textAlign: "center" })}
        aria_label="Align center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().setTextAlign("right").run()}
        is_active={editor.isActive({ textAlign: "right" })}
        aria_label="Align right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().setTextAlign("justify").run()}
        is_active={editor.isActive({ textAlign: "justify" })}
        aria_label="Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Clear formatting */}
      <ToolbarButton
        on_click={() =>
          editor.chain().focus().clearNodes().unsetAllMarks().run()
        }
        aria_label="Clear formatting"
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
