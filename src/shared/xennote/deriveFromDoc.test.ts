import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { deriveFromDoc } from "./deriveFromDoc";
import { MAX_EXCERPT, MAX_PAGE_LINKS, MAX_SEARCH_TEXT } from "./pages";

const t = (text: string): JSONContent => ({ type: "text", text });
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const link = (page_id: string | null, title: string, label = ""): JSONContent => ({
  type: "wikiLink",
  attrs: { page_id, title, label },
});

describe("deriveFromDoc", () => {
  it("collects linked page ids once each", () => {
    const out = deriveFromDoc(doc(p(link("a1", "A"), t(" "), link("a1", "A"), t(" "), link("b2", "B"))));
    expect(out.links).toEqual(["a1", "b2"]);
    expect(out.unresolved).toEqual([]);
  });

  it("keeps links to no page yet as normalised titles", () => {
    const out = deriveFromDoc(doc(p(link(null, "  Risk   Register "), link(null, "risk register"), link("a1", "A"))));
    expect(out.unresolved).toEqual(["risk register"]);
    expect(out.links).toEqual(["a1"]);
  });

  it("collects tags, normalised and unique", () => {
    const tag = (tag: string): JSONContent => ({ type: "hashtag", attrs: { tag } });
    const out = deriveFromDoc(doc(p(tag("Q4"), t(" "), tag("#q4"), t(" "), tag("Plan Ahead"), tag("###"))));
    expect(out.tags).toEqual(["q4", "plan-ahead"]);
  });

  it("collects the files an image or file block shows", () => {
    const out = deriveFromDoc(
      doc(
        { type: "imageBlock", attrs: { file_id: "f1", alt: "chart" } },
        { type: "fileBlock", attrs: { file_id: "f2", name: "plan.pdf" } },
        { type: "imageBlock", attrs: { file_id: "f1", alt: "again" } },
        { type: "imageBlock", attrs: { file_id: null, alt: "" } },
      ),
    );
    expect(out.files).toEqual(["f1", "f2"]);
    expect(out.search_text).toContain("chart");
    expect(out.search_text).toContain("plan.pdf");
  });

  it("counts open and done to-dos, nested ones too", () => {
    const item = (checked: boolean, ...rest: JSONContent[]): JSONContent => ({
      type: "taskItem",
      attrs: { checked },
      content: [p(t("x")), ...rest],
    });
    const out = deriveFromDoc(
      doc({
        type: "taskList",
        content: [item(true), item(false, { type: "taskList", content: [item(false), item(true)] })],
      }),
    );
    expect(out.todo).toEqual({ open: 2, done: 2 });
  });

  it("makes plain text with a line break between blocks", () => {
    const out = deriveFromDoc(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [t("Agenda")] },
        p(t("Review the "), link("a1", "Risk register"), t(" today")),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [p(t("one"))] },
            { type: "listItem", content: [p(t("two"))] },
          ],
        },
      ),
    );
    expect(out.search_text).toBe("Agenda\nReview the Risk register today\none\ntwo");
    expect(out.word_count).toBe(8);
  });

  it("shows a link's label rather than its title when it has one", () => {
    const out = deriveFromDoc(doc(p(link("a1", "Risk register", "the risks"))));
    expect(out.search_text).toBe("the risks");
  });

  it("makes a short excerpt on one line", () => {
    const out = deriveFromDoc(doc(p(t("word ".repeat(200)))));
    expect(out.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT);
    expect(out.excerpt).not.toContain("\n");
  });

  it("caps the plain text and the number of links", () => {
    const big = deriveFromDoc(doc(p(t("x".repeat(MAX_SEARCH_TEXT + 500)))));
    expect(big.search_text).toHaveLength(MAX_SEARCH_TEXT);
    const many = deriveFromDoc(doc(p(...Array.from({ length: MAX_PAGE_LINKS + 20 }, (_, i) => link(`id${i}`, "x")))));
    expect(many.links).toHaveLength(MAX_PAGE_LINKS);
  });

  it("handles an empty page", () => {
    const out = deriveFromDoc({ type: "doc", content: [{ type: "paragraph" }] });
    expect(out).toMatchObject({ links: [], tags: [], files: [], search_text: "", excerpt: "", word_count: 0 });
    expect(out.todo).toEqual({ open: 0, done: 0 });
  });
});
