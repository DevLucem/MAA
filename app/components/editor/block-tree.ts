import type React from "react";
import { duplicateBlocksWithFreshIds } from "../../lib/docs-storage";
import type { DocBlock } from "../../lib/docs-utils";

export function placeCaretAtEnd(el: HTMLElement) {
  el.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function isImeConfirming(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/** Recursively maps blocks (including sub-blocks inside column layouts). */
export function mapBlocksTree(
  blocks: DocBlock[],
  fn: (block: DocBlock) => DocBlock
): DocBlock[] {
  return blocks.map((block) => {
    const mapped = fn(block);
    if (mapped.type === "columns" && Array.isArray(mapped.columns)) {
      return {
        ...mapped,
        columns: mapped.columns.map((col) => mapBlocksTree(col, fn)),
      };
    }
    return mapped;
  });
}

export function findBlockParentList(
  blocks: DocBlock[],
  targetId: string
): DocBlock[] | null {
  for (const b of blocks) {
    if (b.id === targetId) return blocks;
    if (b.type === "columns" && Array.isArray(b.columns)) {
      for (const col of b.columns) {
        const found = findBlockParentList(col, targetId);
        if (found) return found;
      }
    }
  }
  return null;
}

export function mutateBlockListTree(
  blocks: DocBlock[],
  targetId: string,
  mutator: (list: DocBlock[], index: number) => DocBlock[]
): DocBlock[] {
  const idx = blocks.findIndex((b) => b.id === targetId);
  if (idx !== -1) {
    return mutator(blocks, idx);
  }
  return blocks.map((block) => {
    if (block.type !== "columns" || !Array.isArray(block.columns)) return block;
    return {
      ...block,
      columns: block.columns.map((col) =>
        mutateBlockListTree(col, targetId, mutator)
      ),
    };
  });
}

/** Clones a block (and any nested column sub-blocks) with fresh unique IDs. */
export function cloneBlockWithFreshIds(block: DocBlock): DocBlock {
  return duplicateBlocksWithFreshIds([block])[0];
}
