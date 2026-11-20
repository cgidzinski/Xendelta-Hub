import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { checkPageDoc } from "../../pageSchema";
import { deriveFromDoc } from "../../deriveFromDoc";
import { docToMarkdown, markdownToDoc, noteToDoc } from "./index";

/** The same document without block ids, so shapes can be compared. */
function bare(node: JSONContent): JSONContent {
  const { attrs, content, ...rest } = node;
  const { id: _id, ...otherAttrs } = (attrs ?? {}) as Record<string, unknown>;
  return {
    ...rest,
    ...(Object.keys(otherAttrs).length ? { attrs: otherAttrs } : {}),
    ...(content ? { content: content.map(bare) } : {}),
  };
}

const blocksOf = (md: string, options?: Parameters<typeof markdownToDoc>[1]) =>
  (bare(markdownToDoc(md, options)).content ?? []) as JSONContent[];

const para = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const text = (value: string, ...marks: string[]): JSONContent => ({
  type: "text",
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});

describe("markdownToDoc", () => {
  it("makes one empty paragraph from nothing", () => {
    expect(blocksOf("")).toEqual([{ type: "paragraph" }]);
    expect(blocksOf("   \n\n")).toEqual([{ type: "paragraph" }]);
  });

  it("reads headings, clamping deep ones to level 3", () => {
    expect(blocksOf("# One\n\n### Three\n\n###### Six")).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [text("One")] },
      { type: "heading", attrs: { level: 3 }, content: [text("Three")] },
      { type: "heading", attrs: { level: 3 }, content: [text("Six")] },
    ]);
  });

  it("reads bold, italic, strikethrough and inline code", () => {
    expect(blocksOf("a **b** *c* ~~d~~ `e`")).toEqual([
      para(
        text("a "),
        text("b", "bold"),
        text(" "),
        text("c", "italic"),
        text(" "),
        text("d", "strike"),
        text(" "),
        text("e", "code"),
      ),
    ]);
  });

  it("keeps marks in the schema's order when they are combined", () => {
    const doc = markdownToDoc("***both*** and [**linked bold**](https://example.com)");
    expect(checkPageDoc(doc).ok).toBe(true);
  });

  it("keeps a web link and drops an unsafe one", () => {
    const [safe] = blocksOf("[hi](https://example.com/a)");
    expect(safe.content![0].marks).toMatchObject([{ type: "link", attrs: { href: "https://example.com/a" } }]);
    const [unsafe] = blocksOf("[hi](javascript:alert(1))");
    expect(unsafe).toEqual(para(text("hi")));
  });

  it("makes hard breaks", () => {
    expect(blocksOf("one  \ntwo")).toEqual([para(text("one"), { type: "hardBreak" }, text("two"))]);
  });

  it("reads bullet, numbered and task lists, with nesting", () => {
    const [bullets, numbers, tasks] = blocksOf("- a\n- b\n  - c\n\n3. x\n4. y\n\n- [x] done\n- [ ] todo");
    expect(bullets.type).toBe("bulletList");
    expect(bullets.content![1].content![1].type).toBe("bulletList");
    expect(numbers).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
    expect(tasks.type).toBe("taskList");
    expect(tasks.content!.map((i) => i.attrs!.checked)).toEqual([true, false]);
  });

  it("starts every list item with a paragraph", () => {
    const doc = markdownToDoc("- ```\n  code\n  ```");
    expect(checkPageDoc(doc).ok).toBe(true);
  });

  it("reads quotes, code blocks, rules and tables", () => {
    const blocks = blocksOf("> quoted\n\n```js\nlet a = 1;\n```\n\n---\n\n| a | b |\n| - | - |\n| 1 | 2 |");
    expect(blocks.map((b) => b.type)).toEqual(["blockquote", "codeBlock", "horizontalRule", "table"]);
    expect(blocks[1]).toMatchObject({ attrs: { language: "js" }, content: [{ type: "text", text: "let a = 1;" }] });
    const rows = blocks[3].content!;
    expect(rows[0].content!.every((c) => c.type === "tableHeader")).toBe(true);
    expect(rows[1].content!.every((c) => c.type === "tableCell")).toBe(true);
  });

  it("turns [[links]] into page links", () => {
    const resolve = (title: string) => (title === "Known" ? "p1" : null);
    const [p] = blocksOf("see [[Known]], [[Nowhere|the void]] and [[Known|that page]]", { resolveTitle: resolve });
    const links = p.content!.filter((n) => n.type === "wikiLink").map((n) => n.attrs);
    expect(links).toEqual([
      { page_id: "p1", title: "Known", label: "" },
      { page_id: null, title: "Nowhere", label: "the void" },
      { page_id: "p1", title: "Known", label: "that page" },
    ]);
  });

  it("leaves [[links]] alone inside code and inside links", () => {
    const [code] = blocksOf("`[[Not a link]]`");
    expect(code.content![0].type).toBe("text");
    const [linked] = blocksOf("[[[x]]](https://example.com)");
    expect(linked.content!.some((n) => n.type === "wikiLink")).toBe(false);
  });

  it("keeps the words of raw HTML and of images, not the tags", () => {
    const blocks = blocksOf("<div>hello</div>\n\n![a chart](https://example.com/x.png)");
    expect(blocks[0]).toEqual(para(text("<div>hello</div>")));
    expect(blocks[1]).toEqual(para(text("a chart")));
  });

  it("always produces a body the schema accepts, with block ids", () => {
    const md = [
      "# Title",
      "Some *text* with a [[Link]] and `code`.",
      "- one\n- two\n  1. deep",
      "- [ ] task",
      "> quote\n> more",
      "```\nplain\n```",
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "<b>html</b>",
      "[ref]: https://example.com",
    ].join("\n\n");
    const res = checkPageDoc(markdownToDoc(md));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc.content![0].attrs!.id).toEqual(expect.any(String));
  });
});

describe("docToMarkdown", () => {
  const md = (doc: JSONContent, options?: Parameters<typeof docToMarkdown>[1]) => docToMarkdown(doc, options);
  const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

  it("writes every common block", () => {
    const out = md(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Agenda")] },
        para(text("a "), text("b", "bold"), text(" "), text("c", "italic"), text(" "), text("d", "strike")),
        { type: "bulletList", content: [{ type: "listItem", content: [para(text("one"))] }] },
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [para(text("first"))] }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [para(text("done"))] }] },
        { type: "blockquote", content: [para(text("quoted"))] },
        { type: "codeBlock", attrs: { language: "js" }, content: [text("let a = 1;")] },
        { type: "horizontalRule" },
      ),
    );
    expect(out).toBe(
      "## Agenda\n\na **b** *c* ~~d~~\n\n- one\n\n1. first\n\n- [x] done\n\n> quoted\n\n```js\nlet a = 1;\n```\n\n---\n",
    );
  });

  it("keeps a nested list right under its item", () => {
    const out = md(
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              para(text("a")),
              { type: "bulletList", content: [{ type: "listItem", content: [para(text("b"))] }] },
            ],
          },
        ],
      }),
    );
    expect(out).toBe("- a\n  - b\n");
  });

  it("writes tables with a header row", () => {
    const row = (type: string, ...cells: string[]): JSONContent => ({
      type: "tableRow",
      content: cells.map((c) => ({ type, content: [para(text(c))] })),
    });
    const out = md(doc({ type: "table", content: [row("tableHeader", "a", "b"), row("tableCell", "1", "2|x")] }));
    expect(out).toBe("| a | b |\n| --- | --- |\n| 1 | 2\\|x |\n");
  });

  it("writes page links with the current title, files and bookmarks", () => {
    const out = md(
      doc(
        para({ type: "wikiLink", attrs: { page_id: "p1", title: "Old name", label: "" } }, text(" and "), {
          type: "wikiLink",
          attrs: { page_id: null, title: "Gone", label: "that" },
        }),
        { type: "imageBlock", attrs: { file_id: "f1", alt: "chart" } },
        { type: "fileBlock", attrs: { file_id: "f2", name: "plan.pdf" } },
        { type: "bookmark", attrs: { url: "https://example.com", title: "Example", description: "A site" } },
      ),
      { pageTitle: (id, stored) => (id === "p1" ? "New name" : stored), fileUrl: (id, name) => `_files/${id}/${name}` },
    );
    expect(out).toBe(
      "[[New name]] and [[Gone|that]]\n\n![chart](_files/f1/chart)\n\n[plan.pdf](_files/f2/plan.pdf)\n\n[Example](https://example.com)\n\nA site\n",
    );
  });

  it("writes a callout as a labelled quote", () => {
    expect(md(doc({ type: "callout", attrs: { tone: "warning" }, content: [para(text("careful"))] }))).toBe(
      "> [!warning]\n> careful\n",
    );
  });

  it("escapes what would be read as Markdown", () => {
    const out = md(
      doc(
        para(text("2 * 3 = 6, [not a link], `tick`, snake_case and _lone_")),
        para(text("# not a heading")),
        para(text("1. not a list")),
        para(text("- not a bullet")),
      ),
    );
    expect(out).toBe(
      "2 \\* 3 = 6, \\[not a link\\], \\`tick\\`, snake_case and \\_lone\\_\n\n\\# not a heading\n\n1\\. not a list\n\n\\- not a bullet\n",
    );
    // …and reading it back gives the same words.
    const back = markdownToDoc(out);
    expect(deriveFromDoc(back).search_text).toBe(
      "2 * 3 = 6, [not a link], `tick`, snake_case and _lone_\n# not a heading\n1. not a list\n- not a bullet",
    );
  });

  it("uses a longer fence when the code holds backticks", () => {
    const out = md(doc({ type: "codeBlock", attrs: { language: null }, content: [text("```\nx\n```")] }));
    expect(out.startsWith("````\n")).toBe(true);
  });

  it("writes an empty page as just a line break", () => {
    expect(md(doc({ type: "paragraph" }))).toBe("\n");
  });
});

describe("Markdown round trip", () => {
  const canonical = [
    "# Title",
    "",
    "Some **bold**, *italic*, ~~gone~~ and `code` with [a link](https://example.com).",
    "",
    "A line  \nwith a break and [[A page]] and [[Other|shown]].",
    "",
    "- one",
    "- two",
    "  - nested",
    "",
    "3. third",
    "4. fourth",
    "",
    "- [x] done",
    "- [ ] todo",
    "",
    "> quote",
    "",
    "```js",
    "let a = 1;",
    "```",
    "",
    "---",
    "",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
  ].join("\n");

  it("writes back what it read", () => {
    expect(docToMarkdown(markdownToDoc(canonical))).toBe(canonical);
  });

  it("reads back what it wrote", () => {
    const doc = markdownToDoc(canonical);
    expect(bare(markdownToDoc(docToMarkdown(doc)))).toEqual(bare(doc));
  });
});

describe("noteToDoc", () => {
  it("turns a text note into its Markdown blocks", () => {
    const doc = noteToDoc({ type: "text", body: "# Hi\n\nthere" });
    expect(bare(doc).content!.map((b) => b.type)).toEqual(["heading", "paragraph"]);
  });

  it("turns a checklist note into to-dos, then its body", () => {
    const doc = bare(
      noteToDoc({
        type: "checklist",
        body: "remember",
        checklist: [
          { text: "milk", done: true },
          { text: "", done: false },
        ],
      }),
    );
    expect(doc.content![0].type).toBe("taskList");
    expect(doc.content![0].content!.map((i) => i.attrs!.checked)).toEqual([true, false]);
    expect(doc.content![1]).toEqual(para(text("remember")));
  });

  it("turns photos into image blocks", () => {
    const doc = bare(
      noteToDoc({ type: "image", body: "", images: [{ file_id: "f1" }, { file_id: null }, { file_id: "f2" }] }),
    );
    expect(doc.content).toEqual([
      { type: "imageBlock", attrs: { file_id: "f1", alt: "", width: null } },
      { type: "imageBlock", attrs: { file_id: "f2", alt: "", width: null } },
    ]);
  });

  it("turns a link note into a bookmark, keeping only a web address", () => {
    const good = bare(noteToDoc({ type: "link", link: { url: "https://example.com", title: "Ex", description: "d" } }));
    expect(good.content![0]).toEqual({
      type: "bookmark",
      attrs: { url: "https://example.com", title: "Ex", description: "d" },
    });
    const bad = bare(noteToDoc({ type: "link", link: { url: "javascript:alert(1)", title: "Ex", description: "" } }));
    expect(bad.content![0].attrs!.url).toBe("");
  });

  it("makes an empty page from an empty note", () => {
    expect(bare(noteToDoc({ type: "text", body: "" })).content).toEqual([{ type: "paragraph" }]);
  });

  it("always produces a body the schema accepts", () => {
    for (const note of [
      { type: "text", body: "x [[Y]]" },
      { type: "checklist", checklist: [{ text: "a", done: false }] },
      { type: "image", images: [{ file_id: "f1" }], body: "caption" },
      { type: "link", link: { url: "https://example.com", title: "t", description: "" } },
    ] as const) {
      expect(checkPageDoc(noteToDoc(note)).ok).toBe(true);
    }
  });
});
