import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { MAX_PAGE_DOC_BYTES } from "./pages";
import { checkPageDoc, emptyDoc, ensureBlockIds, getPageSchema, stripUnsafeLinks } from "./pageSchema";

const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("page schema", () => {
  it("knows every block and inline type a page can hold", () => {
    const names = Object.keys(getPageSchema().nodes);
    for (const name of [
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "taskList",
      "taskItem",
      "blockquote",
      "codeBlock",
      "horizontalRule",
      "table",
      "callout",
      "imageBlock",
      "fileBlock",
      "bookmark",
      "wikiLink",
      "hashtag",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("is built once", () => {
    expect(getPageSchema()).toBe(getPageSchema());
  });
});

describe("ensureBlockIds", () => {
  it("gives blocks an id and keeps the ones they have", () => {
    const out = ensureBlockIds(
      doc(para("one"), { type: "paragraph", attrs: { id: "keep-me" }, content: [{ type: "text", text: "two" }] }),
    );
    const ids = out.content!.map((n) => n.attrs?.id);
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[1]).toBe("keep-me");
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("does not give a list container an id, but its items", () => {
    const out = ensureBlockIds(doc({ type: "bulletList", content: [{ type: "listItem", content: [para("a")] }] }));
    const list = out.content![0];
    expect(list.attrs?.id).toBeUndefined();
    expect(list.content![0].attrs?.id).toEqual(expect.any(String));
  });
});

describe("checkPageDoc", () => {
  it("accepts an empty page and fills in ids", () => {
    const res = checkPageDoc(emptyDoc());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc.content![0].attrs?.id).toEqual(expect.any(String));
  });

  it("accepts every v1 block", () => {
    const res = checkPageDoc(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Agenda" }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [para("done")] }] },
        { type: "callout", attrs: { tone: "warning" }, content: [para("careful")] },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [para("Stream")] },
                { type: "tableHeader", content: [para("Owner")] },
              ],
            },
          ],
        },
        { type: "imageBlock", attrs: { file_id: "665f0000000000000000abcd", alt: "plan" } },
        {
          type: "fileBlock",
          attrs: { file_id: "665f0000000000000000abce", name: "a.pdf", size: 10, mime: "application/pdf" },
        },
        { type: "bookmark", attrs: { url: "https://example.com", title: "Example", description: "" } },
        {
          type: "paragraph",
          content: [
            { type: "wikiLink", attrs: { page_id: null, title: "Risk register", label: "" } },
            { type: "text", text: " " },
            { type: "hashtag", attrs: { tag: "q4" } },
          ],
        },
      ),
    );
    expect(res.ok).toBe(true);
  });

  it("rejects what is not a document", () => {
    expect(checkPageDoc(null).ok).toBe(false);
    expect(checkPageDoc("hello").ok).toBe(false);
    expect(checkPageDoc({ type: "paragraph" }).ok).toBe(false);
  });

  it("rejects an unknown node", () => {
    expect(checkPageDoc(doc({ type: "script", content: [] })).ok).toBe(false);
  });

  it("rejects a node in the wrong place", () => {
    // A table row can't sit directly in a document.
    expect(checkPageDoc(doc({ type: "tableRow", content: [] })).ok).toBe(false);
  });

  it("rejects a document over the size limit", () => {
    const big = doc(para("x".repeat(MAX_PAGE_DOC_BYTES)));
    const res = checkPageDoc(big);
    expect(res.ok).toBe(false);
  });
});

describe("stripUnsafeLinks", () => {
  const link = (href: string): JSONContent =>
    doc({
      type: "paragraph",
      content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href } }] }],
    });

  it("keeps a web link", () => {
    const out = stripUnsafeLinks(link("https://example.com/a"));
    expect(out.content![0].content![0].marks).toHaveLength(1);
  });

  it("removes the link from javascript: and data: addresses but keeps the text", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,hi", "vbscript:x", ""]) {
      const out = stripUnsafeLinks(link(href));
      const text = out.content![0].content![0];
      expect(text.text).toBe("click");
      expect(text.marks).toBeUndefined();
    }
  });

  it("blanks the address of an unsafe bookmark", () => {
    const out = stripUnsafeLinks(
      doc({ type: "bookmark", attrs: { url: "javascript:alert(1)", title: "t", description: "" } }),
    );
    expect(out.content![0].attrs!.url).toBe("");
  });
});
