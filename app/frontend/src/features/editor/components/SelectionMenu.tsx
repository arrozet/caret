import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, Underline, Strikethrough, Highlighter, Code, Link2 } from "lucide-react";

/** Props for the SelectionMenu component. */
interface SelectionMenuProps {
  /** The active Tiptap editor instance. */
  editor: Editor;
}

/**
 * Floating formatting toolbar that appears on text selection.
 *
 * Uses Tiptap's BubbleMenu to position a compact toolbar above the
 * selected text. Provides quick access to the most common inline
 * formatting actions: Bold, Italic, Underline, Strikethrough,
 * Highlight, Code, and Link.
 *
 * Z-index: 40 (floating UI layer, per FRONTEND.md §Z-Index Layers).
 * Carries `ui-peripheral` so it respects focus mode fading.
 *
 * @param props - Editor instance to bind formatting commands to.
 * @returns The rendered bubble menu component.
 */
export function SelectionMenu({ editor }: SelectionMenuProps) {
  /**
   * Toggle a hyperlink on the current selection.
   * If already a link, unset it; otherwise prompt for a URL.
   */
  function handleLink() {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Enter URL");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top",
        offset: 8,
      }}
      className="ui-peripheral flex items-center gap-0.5 rounded-md border border-border-subtle bg-surface px-1 py-1 shadow-md"
    >
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        label="Underline"
        title="Underline (Ctrl+U)"
      >
        <Underline className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        label="Strikethrough"
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>

      <div className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />

      <ToolbarButton
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        label="Highlight"
        title="Highlight"
      >
        <Highlighter className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        label="Inline code"
        title="Inline code"
      >
        <Code className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("link")}
        onClick={handleLink}
        label={editor.isActive("link") ? "Remove link" : "Add link"}
        title="Link"
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
    </BubbleMenu>
  );
}

/** Props for the internal ToolbarButton. */
interface ToolbarButtonProps {
  /** Whether the format is currently active (pressed state). */
  active: boolean;
  /** Click handler for the button. */
  onClick: () => void;
  /** Accessible label for screen readers. */
  label: string;
  /** Tooltip title on hover. */
  title: string;
  /** Icon child element. */
  children: React.ReactNode;
}

/**
 * Small icon button used inside the SelectionMenu toolbar.
 *
 * @param props - Button configuration and children.
 * @returns Rendered button with active/inactive styles.
 */
function ToolbarButton({ active, onClick, label, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={title}
      className={[
        "flex h-6 w-6 items-center justify-center rounded transition-colors",
        active
          ? "bg-accent-main text-white"
          : "text-text-secondary hover:bg-bg-app hover:text-text-primary",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
