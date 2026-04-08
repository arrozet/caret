import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Page dimensions in pixels at 96 DPI (content area only).
 *
 * Each entry defines the full page dimensions and the uniform padding
 * (top/bottom/left/right). The usable content-area height is:
 *   contentHeight = height - 2 * padding
 */
const PAGE_DIMENSIONS = {
  a4: { width: 794, height: 1123, padding: 96 },
  letter: { width: 816, height: 1056, padding: 96 },
  a3: { width: 1123, height: 1587, padding: 120 },
} as const;

export type PaperSize = keyof typeof PAGE_DIMENSIONS;

const pagination_key = new PluginKey("pagination");

/**
 * Build page-break positions by walking the editor's top-level DOM
 * children and accumulating their heights.
 *
 * We measure each block's own `offsetHeight` (which is layout-
 * independent of decorations above it) and track a running total.
 * When the running total exceeds the content-area height for the
 * current page we record a break *before* that node.
 *
 * Because we use each element's intrinsic height (not its absolute
 * offset) the calculation is stable — inserting/removing gap widgets
 * doesn't change the inputs and therefore can't cause an infinite
 * re-render loop.
 */
function compute_break_positions(view: EditorView, paper_size: PaperSize): number[] {
  const dims = PAGE_DIMENSIONS[paper_size];
  const content_height = dims.height - dims.padding * 2;

  const dom = view.dom;
  const positions: number[] = [];

  // Walk the actual DOM children of the ProseMirror contenteditable.
  // Widget decorations also appear as children, so we need to skip
  // them (they carry the `data-page-break` attribute).
  let cumulative = 0;

  for (let i = 0; i < dom.childNodes.length; i++) {
    const node = dom.childNodes[i] as HTMLElement;

    // Skip non-element nodes and our own decoration widgets.
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    if (node.dataset?.pageBreak) continue;

    const node_height = node.offsetHeight;
    // Include vertical margins in the measurement.
    const style = window.getComputedStyle(node);
    const margin_top = parseFloat(style.marginTop) || 0;
    const margin_bottom = parseFloat(style.marginBottom) || 0;
    const total_height = node_height + margin_top + margin_bottom;

    if (cumulative + total_height > content_height && cumulative > 0) {
      // This block crosses the page boundary. Insert a break *before* it.
      // Resolve the ProseMirror document position from the DOM node.
      const pos = view.posAtDOM(node, 0);
      // We want the position right before the node, so we subtract 1
      // to land at the gap between the previous node and this one.
      positions.push(Math.max(pos - 1, 0));
      cumulative = total_height; // this block starts the new page
    } else {
      cumulative += total_height;
    }
  }

  return positions;
}

/**
 * Check whether two position arrays are identical.
 */
function positions_equal(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Create a DOM element for the page-break visual separator.
 */
function create_break_widget(page_number: number): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.dataset.pageBreak = "true";
  wrapper.contentEditable = "false";
  wrapper.className = "page-break-widget";
  wrapper.setAttribute("aria-hidden", "true");

  // Bottom-edge shadow of the ending page
  const bottom_edge = document.createElement("div");
  bottom_edge.className = "page-break-edge page-break-edge--bottom";
  wrapper.appendChild(bottom_edge);

  // Page number label
  const label = document.createElement("span");
  label.className = "page-break-label";
  label.textContent = `${page_number}`;
  wrapper.appendChild(label);

  // Top-edge shadow of the starting page
  const top_edge = document.createElement("div");
  top_edge.className = "page-break-edge page-break-edge--top";
  wrapper.appendChild(top_edge);

  return wrapper;
}

/**
 * Tiptap extension that adds visual page-break indicators to the editor.
 *
 * It monitors the rendered content height and inserts non-editable gap
 * widgets at positions where the content would overflow a physical page.
 * The widgets look like the bottom edge of one sheet and the top edge
 * of the next, separated by a visible gap (the "desk" between pages).
 *
 * This is purely visual — the document model is NOT modified. When
 * exporting to PDF (via `window.print()` or a server-side renderer)
 * the fixed paper dimensions and `@media print` rules take over.
 */
export const Pagination = Extension.create({
  name: "pagination",

  addOptions() {
    return {
      paper_size: "a4" as PaperSize,
    };
  },

  addProseMirrorPlugins() {
    // Store reference to extension options to avoid 'this' aliasing
    const { options } = this;
    let last_positions: number[] = [];
    let raf_id: number | null = null;

    return [
      new Plugin({
        key: pagination_key,

        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, set) {
            // If the transaction carries new decorations from us, use them.
            const meta = tr.getMeta(pagination_key);
            if (meta !== undefined) return meta;
            // Otherwise map existing decorations through the transaction's
            // mapping so positions stay correct after edits.
            return set.map(tr.mapping, tr.doc);
          },
        },

        props: {
          decorations(state) {
            return pagination_key.getState(state);
          },
        },

        view() {
          return {
            update(view) {
              // Debounce via rAF so we measure after the browser paints.
              if (raf_id !== null) cancelAnimationFrame(raf_id);
              raf_id = requestAnimationFrame(() => {
                raf_id = null;
                const paper_size = options.paper_size as PaperSize;
                const positions = compute_break_positions(view, paper_size);

                // Only dispatch if positions actually changed.
                if (positions_equal(positions, last_positions)) return;
                last_positions = positions;

                // Build a DecorationSet with widget decorations.
                const decorations = positions.map((pos, idx) =>
                  Decoration.widget(pos, () => create_break_widget(idx + 1), {
                    side: -1, // render before the node at this pos
                    key: `page-break-${idx}`,
                  }),
                );

                const set = DecorationSet.create(view.state.doc, decorations);
                view.dispatch(view.state.tr.setMeta(pagination_key, set));
              });
            },

            destroy() {
              if (raf_id !== null) cancelAnimationFrame(raf_id);
            },
          };
        },
      }),
    ];
  },
});
