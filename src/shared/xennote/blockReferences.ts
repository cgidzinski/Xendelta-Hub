import type { JSONContent } from "@tiptap/core";

export interface BlockTarget {
  page_id: string;
  block_id: string;
}

export const blockIdPattern = /^[a-z0-9_-]{1,128}$/i;
export const pageIdPattern = /^[a-f0-9]{24}$/i;

export function blockTarget(node: JSONContent): BlockTarget | null {
  if (node.type !== "blockRef" && node.type !== "blockEmbed") return null;
  const { page_id, block_id } = node.attrs ?? {};
  return typeof page_id === "string" &&
    pageIdPattern.test(page_id) &&
    typeof block_id === "string" &&
    blockIdPattern.test(block_id)
    ? { page_id, block_id }
    : null;
}

export function walkBlocks(doc: JSONContent, visit: (node: JSONContent) => void) {
  visit(doc);
  doc.content?.forEach((child) => walkBlocks(child, visit));
}

export function deriveBlockRefs(doc: JSONContent) {
  const targets = new Map<string, BlockTarget>();
  walkBlocks(doc, (node) => {
    const target = blockTarget(node);
    if (target && targets.size < 500) targets.set(`${target.page_id}:${target.block_id}`, target);
  });
  return [...targets.values()];
}

export type BlockPreview =
  | { status: "locked" | "removed" }
  | { status: "available"; title: string; excerpt: string; type: string; url?: string; name?: string };
