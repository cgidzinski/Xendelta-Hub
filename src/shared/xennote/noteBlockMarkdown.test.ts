import { expect, it } from "vitest";
import { canEditWithNoteBlocks, noteDocToMarkdown, noteMarkdownToDoc } from "./noteBlockMarkdown";

it("keeps note links title-based through real Markdown formatting", () => {
  const original = [
    "# A field guide",
    "",
    "See [[Planning notes|the plan]] and **send it**. [Read the docs](https://example.com/docs).",
    "",
    "- [ ] Take pictures",
    "- [x] Check the route",
    "",
    "> Don't overwrite `report.md`.",
    "",
    "```sh",
    "cat report.md",
    "```",
    "",
    "| Item | Status |",
    "| --- | --- |",
    "| Route | Ready |",
  ].join("\n");
  expect(canEditWithNoteBlocks(original)).toBe(true);
  const doc = noteMarkdownToDoc(original);
  expect(JSON.stringify(doc)).toContain('"type":"noteLink"');
  expect(JSON.stringify(doc)).not.toContain("page_id");
  const markdown = noteDocToMarkdown(doc);
  expect(markdown).toContain("[[Planning notes|the plan]]");
  expect(markdown).toContain("- [x] Check the route");
  expect(markdown).toContain("cat report.md");
  expect(markdown).toContain("| Route | Ready |");
  const rerendered = noteMarkdownToDoc(markdown);
  expect(rerendered.content?.map((block) => block.type)).toEqual(doc.content?.map((block) => block.type));
});

it.each([
  "#### Detailed heading",
  "[Original link][docs]\n\n[docs]: https://example.com",
  "![Reference diagram](https://example.com/diagram.png)",
  "| Day | Time |\n| :--- | ---: |\n| Tuesday | 10:30 |",
])("keeps existing Markdown that blocks can't preserve in source mode: %s", (markdown) => {
  expect(canEditWithNoteBlocks(markdown)).toBe(false);
});
