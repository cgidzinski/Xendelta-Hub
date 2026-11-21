// A page body to Markdown (version 1 of the converter). Used for export, for rolling a migrated page back to a note, and
// later for saving a note that was edited in the page editor. Frozen along with markdownToDoc.
//
// Page links come out as `[[Title]]` (or `[[Title|label]]`), uploaded files as ordinary Markdown links to whatever
// `fileUrl` returns, and the few things Markdown can't say (a callout, underline) as the nearest plain form.

import type { JSONContent } from "@tiptap/core";

export interface DocToMarkdownOptions {
  /** Where a stored file is found in the export. */
  fileUrl?: (fileId: string, name: string) => string;
  /** The current title of a linked page, falling back to the title written in the link. */
  pageTitle?: (pageId: string, stored: string) => string;
}

const IN_LINK_BREAKERS = /[[\]|\n]/g;

/** Escape what would otherwise be read as Markdown inside running text. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/</g, "\\<")
    .replace(/~~/g, "\\~\\~")
    .replace(/(^|[^\p{L}\p{N}])_+|_+(?=$|[^\p{L}\p{N}])/gu, (m) => m.replace(/_/g, "\\_"));
}

/** A line that would start a heading, quote, list or rule is made plain text. */
function escapeLineStarts(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s{0,3})(#{1,6})(?=\s|$)/, "$1\\$2")
        .replace(/^(\s{0,3})>/, "$1\\>")
        .replace(/^(\s{0,3})([-+])(?=\s|$)/, "$1\\$2")
        .replace(/^(\s{0,3})(\d+)([.)])(?=\s|$)/, "$1$2\\$3")
        .replace(/^(\s{0,3})(-{3,}|={3,})\s*$/, "$1\\$2"),
    )
    .join("\n");
}

function wrap(text: string, marker: string): string {
  const core = text.trim();
  if (!core) return text;
  const lead = text.slice(0, text.length - text.trimStart().length);
  const trail = text.slice(text.trimEnd().length);
  return `${lead}${marker}${core}${marker}${trail}`;
}

export function docToMarkdown(doc: JSONContent, options: DocToMarkdownOptions = {}): string {
  const fileUrl = options.fileUrl ?? ((id: string) => `files/${id}`);

  const inlineText = (nodes: JSONContent[] | undefined): string =>
    (nodes ?? [])
      .map((node): string => {
        switch (node.type) {
          case "text": {
            const marks = node.marks ?? [];
            const code = marks.some((m) => m.type === "code");
            if (code) {
              const fence = "`".repeat(
                Math.max(1, ...((node.text ?? "").match(/`+/g)?.map((s) => s.length + 1) ?? [1])),
              );
              return `${fence}${node.text}${fence}`;
            }
            let out = escapeText(node.text ?? "");
            for (const m of marks) {
              if (m.type === "bold") out = wrap(out, "**");
              else if (m.type === "italic") out = wrap(out, "*");
              else if (m.type === "strike") out = wrap(out, "~~");
            }
            const link = marks.find((m) => m.type === "link");
            return link ? `[${out}](${String(link.attrs?.href ?? "")})` : out;
          }
          case "hardBreak":
            return "  \n";
          case "wikiLink": {
            const stored = String(node.attrs?.title ?? "");
            const id = typeof node.attrs?.page_id === "string" ? node.attrs.page_id : "";
            const title = (id && options.pageTitle ? options.pageTitle(id, stored) : stored).replace(
              IN_LINK_BREAKERS,
              " ",
            );
            const label = String(node.attrs?.label ?? "").replace(IN_LINK_BREAKERS, " ");
            if (!title) return label;
            return label && label !== title ? `[[${title}|${label}]]` : `[[${title}]]`;
          }
          case "hashtag":
            return `#${String(node.attrs?.tag ?? "")}`;
          default:
            return inlineText(node.content);
        }
      })
      .join("");

  const indent = (text: string, prefix: string, firstPrefix = prefix): string =>
    text
      .split("\n")
      .map((line, i) => (i === 0 ? firstPrefix + line : line ? prefix + line : line))
      .join("\n");

  const quote = (text: string): string =>
    text
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");

  const blocks = (nodes: JSONContent[] | undefined, inItem = false): string => {
    const parts: string[] = [];
    let previous: JSONContent | undefined;
    for (const node of nodes ?? []) {
      const text = block(node);
      if (!text) continue;
      // A list that follows a paragraph inside a list item sits right under it.
      const nested = inItem && previous?.type === "paragraph" && /List$/.test(node.type ?? "");
      parts.push(parts.length ? (nested ? "\n" : "\n\n") + text : text);
      previous = node;
    }
    return parts.join("");
  };

  const listItems = (node: JSONContent): string => {
    const items = node.content ?? [];
    const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
    return items
      .map((item, i) => {
        const marker =
          node.type === "orderedList"
            ? `${start + i}. `
            : node.type === "taskList"
              ? item.attrs?.checked
                ? "- [x] "
                : "- [ ] "
              : "- ";
        return indent(blocks(item.content, true), " ".repeat(marker.length), marker);
      })
      .join("\n");
  };

  const table = (node: JSONContent): string => {
    const rows = (node.content ?? []).map((row) =>
      (row.content ?? []).map((cell) =>
        blocks(cell.content)
          .replace(/\|/g, "\\|")
          .replace(/\s*\n+\s*/g, " ")
          .trim(),
      ),
    );
    const width = Math.max(1, ...rows.map((r) => r.length));
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
    if (!rows.length) return "";
    return [line(rows[0]), line(Array.from({ length: width }, () => "---")), ...rows.slice(1).map(line)].join("\n");
  };

  function block(node: JSONContent): string {
    switch (node.type) {
      case "paragraph":
        return escapeLineStarts(inlineText(node.content));
      case "heading":
        return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inlineText(node.content)}`;
      case "blockquote":
        return quote(blocks(node.content));
      case "callout":
        return quote(`[!${String(node.attrs?.tone ?? "info")}]\n${blocks(node.content)}`);
      case "codeBlock": {
        const code = (node.content ?? []).map((n) => n.text ?? "").join("");
        const fence = "`".repeat(Math.max(3, ...(code.match(/`+/g)?.map((s) => s.length + 1) ?? [3])));
        return `${fence}${String(node.attrs?.language ?? "")}\n${code}\n${fence}`;
      }
      case "horizontalRule":
        return "---";
      case "bulletList":
      case "orderedList":
      case "taskList":
        return listItems(node);
      case "table":
        return table(node);
      case "imageBlock": {
        const id = node.attrs?.file_id;
        const alt = String(node.attrs?.alt ?? "");
        return typeof id === "string" && id ? `![${alt}](${fileUrl(id, alt || "image")})` : alt;
      }
      case "fileBlock": {
        const id = node.attrs?.file_id;
        const name = String(node.attrs?.name ?? "file");
        return typeof id === "string" && id ? `[${name}](${fileUrl(id, name)})` : name;
      }
      case "bookmark": {
        const url = String(node.attrs?.url ?? "");
        const title = String(node.attrs?.title ?? "") || url;
        const description = String(node.attrs?.description ?? "");
        const head = url ? `[${title}](${url})` : title;
        return description ? `${head}\n\n${description}` : head;
      }
      default:
        return blocks(node.content);
    }
  }

  return `${blocks(doc.content)}\n`;
}
