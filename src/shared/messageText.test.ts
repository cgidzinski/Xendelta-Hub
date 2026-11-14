import { describe, it, expect } from "vitest";
import { plainMessageText, stripMarkdown } from "./messageText";

const ID = "64b64b64b64b64b64b64b64b";

describe("stripMarkdown", () => {
  it("removes bold, italic and strikethrough marks", () => {
    expect(stripMarkdown("a **bold** and *italic* and _also_ and ~~gone~~")).toBe(
      "a bold and italic and also and gone",
    );
  });
  it("keeps the words of code, quotes and links", () => {
    expect(stripMarkdown("use `npm test` now")).toBe("use npm test now");
    expect(stripMarkdown("```js\nlet x = 1;\n```")).toBe("let x = 1;\n");
    expect(stripMarkdown("> quoted words")).toBe("quoted words");
    expect(stripMarkdown("see [the docs](https://example.com/x)")).toBe("see the docs");
    expect(stripMarkdown("![a cat](https://x/y.png)")).toBe("a cat");
  });
  it("hides a spoiler", () => {
    expect(stripMarkdown("the end is ||the butler||")).toBe("the end is ▒▒▒");
  });
  it("leaves ordinary text alone, including lone symbols", () => {
    expect(stripMarkdown("2 * 3 = 6 and snake_case_word")).toBe("2 * 3 = 6 and snake_case_word");
    expect(stripMarkdown("plain words")).toBe("plain words");
    expect(stripMarkdown("")).toBe("");
  });
});

describe("plainMessageText", () => {
  it("writes custom emoji as :name: and strips the marks", () => {
    expect(plainMessageText(`**hi** <:party:${ID}>`)).toBe("hi :party:");
  });

  it("writes a mention as @name, or @someone when the name isn't known", () => {
    const id = "64b64b64b64b64b64b64b64b";
    expect(plainMessageText(`hey <@${id}>, **look**`, new Map([[id, "Sam"]]))).toBe("hey @Sam, look");
    expect(plainMessageText(`hey <@${id}>`)).toBe("hey @someone");
  });
});
