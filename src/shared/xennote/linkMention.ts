// "Link it": turn a plain-text mention of a page's name into a link to that page. A page is mentioned by its title or by
// one of its aliases, in running text (not inside code, and not in text that is already a link). Pure, so the server
// and its tests share it.

import type { JSONContent } from "@tiptap/core";

export interface MentionTarget {
  id: string;
  title: string;
  aliases: readonly string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The names a page goes by, longest first so "Q4 planning kickoff" wins over "Q4 planning". */
function namesOf(target: MentionTarget): string[] {
  return [...new Set([target.title, ...target.aliases].map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
}

/** The matcher for a page's names: whole words only, any case. Null when the page has no name to look for. */
export function mentionPattern(target: MentionTarget): RegExp | null {
  const names = namesOf(target);
  if (names.length === 0) return null;
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${names.map(escape).join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu");
}

/** Where the first mention of `target` is in `text`, or null. */
export function findMention(text: string, target: MentionTarget): { index: number; length: number } | null {
  const rx = mentionPattern(target);
  const m = rx?.exec(text);
  return m ? { index: m.index + m[1].length, length: m[2].length } : null;
}

/** A short piece of `text` around the first mention, for showing why a page matched. */
export function mentionSnippet(text: string, target: MentionTarget, width = 90): string {
  const flat = text.replace(/\s+/g, " ");
  const at = findMention(flat, target);
  if (!at) return flat.slice(0, width);
  const start = Math.max(0, at.index - 30);
  const piece = flat.slice(start, start + width);
  return `${start > 0 ? "…" : ""}${piece}${start + width < flat.length ? "…" : ""}`;
}

/** Replace the first mention of the page in a body with a link to it. `changed` is false when there is none. */
export function linkFirstMention(doc: JSONContent, target: MentionTarget): { doc: JSONContent; changed: boolean } {
  let changed = false;

  const walk = (node: JSONContent): JSONContent => {
    if (changed || node.type === "codeBlock" || !node.content) return node;
    const out: JSONContent[] = [];
    for (const child of node.content) {
      if (!changed && child.type === "text" && !child.marks?.some((m) => m.type === "link" || m.type === "code")) {
        const at = findMention(child.text ?? "", target);
        if (at) {
          changed = true;
          const text = child.text ?? "";
          const typed = text.slice(at.index, at.index + at.length);
          const part = (s: string): JSONContent[] => (s ? [{ ...child, text: s }] : []);
          out.push(
            ...part(text.slice(0, at.index)),
            {
              type: "wikiLink",
              attrs: { page_id: target.id, title: target.title, label: typed === target.title ? "" : typed },
            },
            ...part(text.slice(at.index + at.length)),
          );
          continue;
        }
      }
      out.push(walk(child));
    }
    return { ...node, content: out };
  };

  const next = walk(doc);
  // With nothing to link, hand back the very same body.
  return { doc: changed ? next : doc, changed };
}
