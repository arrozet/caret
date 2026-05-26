import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
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
}

/**
 * Props for a single toolbar button.
 */
interface ToolbarButtonProps {
  /** Click handler. */
  onClick: () => void;
  /** Whether this formatting option is currently active. */
  isActive?: boolean;
  /** Whether the button is disabled. */
  isDisabled?: boolean;
  /** Accessible label for the button. */
  ariaLabel: string;
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
  onClick,
  isActive = false,
  isDisabled = false,
  ariaLabel,
  shortcut,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center",
        "h-8 w-8 rounded-[4px]",
        "transition-all duration-[100ms] ease-in-out",
        "cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        isActive
          ? "bg-accent-main/10 text-accent-main"
          : "text-text-secondary hover:text-text-primary hover:bg-surface",
      ].join(" ")}
      aria-label={ariaLabel}
      title={shortcut ? `${ariaLabel} (${shortcut})` : ariaLabel}
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
  const currentFont = editor.getAttributes("textStyle").fontFamily || "";

  const handleChange = useCallback(
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
      value={currentFont}
      onChange={handleChange}
      className="h-8 rounded-[4px] border border-border-subtle bg-surface px-2 text-ui-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent-main focus:ring-1 focus:ring-accent-main/40"
      aria-label="Font family"
      title="Font family"
    >
      <option value="" className="bg-surface text-text-primary">
        Default (Merriweather)
      </option>
      <option value="Inter" className="bg-surface text-text-primary">
        Inter
      </option>
      <option value="Georgia" className="bg-surface text-text-primary">
        Georgia
      </option>
      <option value="Arial" className="bg-surface text-text-primary">
        Arial
      </option>
      <option value="Times New Roman" className="bg-surface text-text-primary">
        Times New Roman
      </option>
      <option value="Courier New" className="bg-surface text-text-primary">
        Courier New
      </option>
      <option value="Verdana" className="bg-surface text-text-primary">
        Verdana
      </option>
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
export function EditorToolbar({ editor }: EditorToolbarProps) {
  const addLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    const url = window.prompt("Image URL");

    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insertTable = useCallback(() => {
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
        onClick={() => editor.chain().focus().undo().run()}
        isDisabled={!editor.can().undo()}
        ariaLabel="Undo"
        shortcut="Ctrl+Z"
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        isDisabled={!editor.can().redo()}
        ariaLabel="Redo"
        shortcut="Ctrl+Y"
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Font family */}
      <FontFamilySelect editor={editor} />

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        ariaLabel="Bold"
        shortcut="Ctrl+B"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        ariaLabel="Italic"
        shortcut="Ctrl+I"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        ariaLabel="Underline"
        shortcut="Ctrl+U"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        ariaLabel="Strikethrough"
        shortcut="Ctrl+Shift+S"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive("highlight")}
        ariaLabel="Highlight"
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        ariaLabel="Heading 1"
        shortcut="Ctrl+Alt+1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        ariaLabel="Heading 2"
        shortcut="Ctrl+Alt+2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        ariaLabel="Heading 3"
        shortcut="Ctrl+Alt+3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        ariaLabel="Bullet list"
        shortcut="Ctrl+Shift+8"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        ariaLabel="Numbered list"
        shortcut="Ctrl+Shift+7"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        ariaLabel="Blockquote"
        shortcut="Ctrl+Shift+B"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        ariaLabel="Code block"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        ariaLabel="Horizontal rule"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive("taskList")}
        ariaLabel="Task list"
        shortcut="Ctrl+Shift+9"
      >
        <CheckSquare className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Insert objects */}
      <ToolbarButton
        onClick={addLink}
        isActive={editor.isActive("link")}
        ariaLabel="Link"
        shortcut="Ctrl+K"
      >
        <Link2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={addImage} ariaLabel="Insert Image">
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={insertTable}
        isActive={editor.isActive("table")}
        ariaLabel="Insert Table"
      >
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={editor.isActive({ textAlign: "left" })}
        ariaLabel="Align left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={editor.isActive({ textAlign: "center" })}
        ariaLabel="Align center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={editor.isActive({ textAlign: "right" })}
        ariaLabel="Align right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        isActive={editor.isActive({ textAlign: "justify" })}
        ariaLabel="Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Clear formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        ariaLabel="Clear formatting"
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
