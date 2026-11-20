// Markdown to a page body (version 1 of the converter). Used to turn notes into pages, and later to open a note in the
// page editor. Frozen: the migration relies on it behaving exactly like this, so a change that would alter its output
// goes in a new version folder, not here.
//
// What is kept: headings, paragraphs, bold, italic, strikethrough, inline code, web links, line breaks, bullet, numbered
// and task lists, quotes, code blocks, rules and tables. `[[Title]]` becomes a page link. What is not: raw HTML (its text
// is kept, its tags are not), images (their alt text is kept), table alignment, and headings deeper than level 3 (shown
// as level 3).

import type { JSONContent } from "@tiptap/core";
import type { ListItem, PhrasingContent, RootContent, Table } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { isSafeUrl } from "../../notes";
import { ensureBlockIds, getPageSchema } from "../../pageSchema";
import { WIKI_LINK } from "../../wikiLinks";

export interface MarkdownToDocOptions {
  /** The id of the page a `[[title]]` points at, or null when there is none yet. */
  resolveTitle?: (title: string) => string | null;
}

type Mark = { type: string; attrs?: Record<string, unknown> };

const parser = unified().use(remarkParse).use(remarkGfm);

/** Marks must be listed in the schema's own order or ProseMirror rejects the node. */
function sortMarks(marks: Mark[]): Mark[] {
  const rank = Object.keys(getPageSchema().marks);
  return [...marks].sort((a, b) => rank.indexOf(a.type) - rank.indexOf(b.type));
}

function textNode(text: string, marks: Mark[]): JSONContent[] {
  if (!text) return [];
  return [marks.length ? { type: "text", text, marks: sortMarks(marks) } : { type: "text", text }];
}

/** Join neighbouring text pieces that carry the same marks, so a document has the fewest nodes that say the same. */
function mergeText(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (
      last &&
      last.type === "text" &&
      node.type === "text" &&
      JSON.stringify(last.marks ?? null) === JSON.stringify(node.marks ?? null)
    ) {
      out[out.length - 1] = { ...last, text: (last.text ?? "") + (node.text ?? "") };
    } else {
      out.push(node);
    }
  }
  return out;
}

export function markdownToDoc(markdown: string, options: MarkdownToDocOptions = {}): JSONContent {
  const tree = parser.parse(markdown);

  /** Plain words, with any `[[links]]` in them turned into link nodes (not inside code or an existing link). */
  const text = (value: string, marks: Mark[], inLink: boolean): JSONContent[] => {
    if (inLink || marks.some((m) => m.type === "code")) return textNode(value, marks);
    const out: JSONContent[] = [];
    let at = 0;
    for (const m of value.matchAll(WIKI_LINK)) {
      const title = m[1].trim();
      if (!title) continue;
      out.push(...textNode(value.slice(at, m.index), marks));
      const label = m[2]?.trim() ?? "";
      out.push({
        type: "wikiLink",
        attrs: { page_id: options.resolveTitle?.(title) ?? null, title, label: label && label !== title ? label : "" },
      });
      at = m.index + m[0].length;
    }
    out.push(...textNode(value.slice(at), marks));
    return out;
  };

  const inline = (nodes: PhrasingContent[], marks: Mark[] = [], inLink = false): JSONContent[] =>
    mergeText(
      nodes.flatMap((node): JSONContent[] => {
        switch (node.type) {
          case "text":
            return text(node.value, marks, inLink);
          case "emphasis":
            return inline(node.children, [...marks, { type: "italic" }], inLink);
          case "strong":
            return inline(node.children, [...marks, { type: "bold" }], inLink);
          case "delete":
            return inline(node.children, [...marks, { type: "strike" }], inLink);
          case "inlineCode":
            // A code mark can't be combined with any other.
            return textNode(node.value, [{ type: "code" }]);
          case "link":
            return isSafeUrl(node.url)
              ? inline(node.children, [...marks, { type: "link", attrs: { href: node.url } }], true)
              : inline(node.children, marks, true);
          case "break":
            return [{ type: "hardBreak" }];
          case "image":
            return textNode(node.alt ?? "", marks);
          case "html":
            return textNode(node.value, marks);
          case "footnoteReference":
            return textNode(`[^${node.label ?? node.identifier}]`, marks);
          default:
            return textNode(toString(node), marks);
        }
      }),
    );

  const paragraph = (nodes: PhrasingContent[]): JSONContent => {
    const content = inline(nodes);
    return content.length ? { type: "paragraph", content } : { type: "paragraph" };
  };

  /** A list item's content must start with a paragraph. */
  const itemContent = (item: ListItem): JSONContent[] => {
    const blocks = item.children.flatMap(block);
    return blocks[0]?.type === "paragraph" ? blocks : [{ type: "paragraph" }, ...blocks];
  };

  const table = (node: Table): JSONContent => ({
    type: "table",
    content: node.children.map((row, rowIndex) => ({
      type: "tableRow",
      content: row.children.map((cell) => ({
        type: rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [paragraph(cell.children)],
      })),
    })),
  });

  function block(node: RootContent): JSONContent[] {
    switch (node.type) {
      case "paragraph":
        return [paragraph(node.children)];
      case "heading":
        return [{ type: "heading", attrs: { level: Math.min(node.depth, 3) }, content: inline(node.children) }];
      case "blockquote": {
        const content = node.children.flatMap(block);
        return [{ type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] }];
      }
      case "list": {
        const isTaskList = node.children.some((item) => typeof item.checked === "boolean");
        if (isTaskList) {
          return [
            {
              type: "taskList",
              content: node.children.map((item) => ({
                type: "taskItem",
                attrs: { checked: item.checked === true },
                content: itemContent(item),
              })),
            },
          ];
        }
        return [
          {
            type: node.ordered ? "orderedList" : "bulletList",
            ...(node.ordered && node.start && node.start !== 1 ? { attrs: { start: node.start } } : {}),
            content: node.children.map((item) => ({ type: "listItem", content: itemContent(item) })),
          },
        ];
      }
      case "code":
        return [
          {
            type: "codeBlock",
            attrs: { language: node.lang ?? null },
            ...(node.value ? { content: [{ type: "text", text: node.value }] } : {}),
          },
        ];
      case "thematicBreak":
        return [{ type: "horizontalRule" }];
      case "table":
        return [table(node)];
      case "html":
        return node.value
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => ({ type: "paragraph", content: textNode(line, []) }));
      case "definition":
        return [{ type: "paragraph", content: textNode(`[${node.label ?? node.identifier}]: ${node.url}`, []) }];
      case "footnoteDefinition":
        return node.children.flatMap(block);
      default:
        return [{ type: "paragraph", content: textNode(toString(node), []) }];
    }
  }

  const content = tree.children.flatMap(block);
  return ensureBlockIds({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] });
}
