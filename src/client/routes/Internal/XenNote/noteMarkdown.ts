import { WIKI_LINK } from "@shared/xennote/wikiLinks";

// Markdown in notes: the one remark plugin that turns [[Note title]] into a link, kept apart from the component so it can
// be tested on its own.

/** The address scheme a [[note link]] is given while it is rendered; NoteMarkdown turns it into a button or plain text. */
export const WIKI_SCHEME = "xennote-note:";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

// Text inside these is left alone: a [[link]] in a code block or in another link is just text.
const SKIP = new Set(["link", "linkReference", "inlineCode", "code", "definition"]);

function splitText(value: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(new RegExp(WIKI_LINK.source, "g"))) {
    const title = m[1].trim();
    if (!title) continue;
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", value: value.slice(last, at) });
    out.push({
      type: "link",
      url: WIKI_SCHEME + encodeURIComponent(title),
      children: [{ type: "text", value: (m[2] ?? m[1]).trim() || title }],
    });
    last = at + m[0].length;
  }
  if (last === 0) return [{ type: "text", value }];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function visit(node: MdNode) {
  if (!node.children || SKIP.has(node.type)) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value && child.value.includes("[[")) next.push(...splitText(child.value));
    else {
      visit(child);
      next.push(child);
    }
  }
  node.children = next;
}

/** A remark plugin: every [[Title]] or [[Title|label]] in the text becomes a link to `xennote-note:<title>`. */
export function remarkWikiLinks() {
  return (tree: MdNode) => visit(tree);
}

/** The title inside a `xennote-note:` address, or null if it isn't one. */
export function wikiTitleFromHref(href: string | undefined): string | null {
  if (!href || !href.startsWith(WIKI_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(WIKI_SCHEME.length));
  } catch {
    return null;
  }
}
