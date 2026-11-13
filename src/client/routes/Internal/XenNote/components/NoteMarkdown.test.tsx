import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NoteMarkdown from "./NoteMarkdown";

const html = (text: string, props: Partial<Parameters<typeof NoteMarkdown>[0]> = {}) =>
  renderToStaticMarkup(<NoteMarkdown text={text} {...props} />);

describe("NoteMarkdown formatting", () => {
  it("renders the usual Markdown", () => {
    const out = html(
      "# Title\n\nSome **bold** and *italic* and `code`.\n\n- one\n- two\n\n1. first\n\n> quoted\n\n---\n\n```\nlet x = 1;\n```",
    );
    expect(out).toContain("<h1");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain("<ul");
    expect(out).toContain("<ol");
    expect(out).toContain("<blockquote");
    expect(out).toContain("<hr");
    expect(out).toContain("<pre");
  });

  it("renders GitHub-style tables, strikethrough and task lists", () => {
    const out = html("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~\n\n- [x] done\n- [ ] todo");
    expect(out).toContain("<table");
    expect(out).toContain("<del>gone</del>");
    expect(out.match(/type="checkbox"/g)).toHaveLength(2);
    expect(out).toContain("disabled");
  });

  it("keeps single line breaks, as plain notes always had them", () => {
    const out = html("line one\nline two");
    expect(out).toContain("line one\nline two"); // one paragraph; the newline survives and pre-line shows it
  });

  it("plain text with nothing special reads the same", () => {
    expect(html("just some words")).toContain("<p>just some words</p>");
    expect(html("")).not.toContain("<p>");
  });
});

describe("NoteMarkdown safety", () => {
  it("drops raw HTML instead of putting it in the page", () => {
    const out = html(
      '<script>alert(1)</script><img src=x onerror=alert(1)><b onclick="x()">bold</b> <iframe src="https://evil.example"></iframe>',
    );
    expect(out).not.toMatch(/<script|<iframe|<img|onerror|onclick/i);
  });

  it("refuses javascript: and other script addresses in links, but keeps normal ones", () => {
    const out = html(
      "[click](javascript:alert(1)) [data](data:text/html,<b>x</b>) [vbs](vbscript:x) [ok](https://example.com/a?b=1) [mail](mailto:a@b.example)",
    );
    expect(out).not.toMatch(/href="javascript:|href="data:|href="vbscript:/i);
    expect(out).toContain('href="https://example.com/a?b=1"');
    expect(out).toContain('href="mailto:a@b.example"');
  });

  it("opens links in a new tab without telling the other site where you came from", () => {
    const out = html("[x](https://example.com)");
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("doesn't load pictures from other sites", () => {
    const out = html("![a cat](https://tracker.example/pixel.png) and ![](https://tracker.example/x.png)");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("tracker.example");
    expect(out).toContain("[image: a cat]");
  });

  it("autolinks a bare address safely", () => {
    const out = html("see https://example.com/page now");
    expect(out).toContain('href="https://example.com/page"');
  });
});

describe("NoteMarkdown [[note links]]", () => {
  const resolve = (title: string) => (title.toLowerCase() === "groceries" ? "n1" : null);

  it("is just the words where links can't be followed", () => {
    const out = html("buy [[Groceries]] and [[Plan|the plan]]");
    expect(out).toContain("buy Groceries and the plan");
    expect(out).not.toContain("[[");
    expect(out).not.toContain("xennote-note");
  });

  it("is a button for a note that exists, plain-but-marked for one that doesn't", () => {
    const out = html("[[Groceries]] and [[Nothing here]]", { resolve, onOpenNote: () => undefined });
    expect(out).toMatch(/<button[^>]*title="Open “Groceries”"[^>]*>Groceries<\/button>/);
    expect(out).toContain('title="No note called “Nothing here”"');
    expect(out).not.toContain("xennote-note");
  });

  it("shows a found note's words without a button when nothing can open it", () => {
    const out = html("[[Groceries|the list]]", { resolve });
    expect(out).toContain("the list");
    expect(out).not.toContain("<button");
  });

  it("leaves [[links]] alone inside code, and inside other links", () => {
    const out = html("`[[Groceries]]` and\n\n```\n[[Groceries]]\n```\n\n[see [[Groceries]]](https://example.com)", {
      resolve,
      onOpenNote: () => undefined,
    });
    expect(out).not.toContain("<button");
    expect(out).toContain("[[Groceries]]");
  });

  it("a title with quotes, ampersands or tags can't break out into markup", () => {
    const out = html('[[a "quoted" <b onclick="x()">title</b> & more]] and [[plain "quoted" & more]]', {
      resolve: () => "n1",
      onOpenNote: () => undefined,
    });
    expect(out).not.toMatch(/<b[ >]|onclick/i); // the raw tags are dropped
    expect(out).toContain("title"); // what was between them stays
    // a real link's title is escaped inside its attribute
    expect(out).toContain('title="Open “plain &quot;quoted&quot; &amp; more”"');
  });
});
