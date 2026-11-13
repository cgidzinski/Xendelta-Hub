import { describe, it, expect } from "vitest";
import { describeShare, hostOf, interpretShare } from "./shareContent";

describe("interpretShare", () => {
  it("takes the address from url, with the title as its name", () => {
    expect(interpretShare({ title: "Great recipe", url: "https://food.example.com/pancakes" })).toEqual({
      url: "https://food.example.com/pancakes",
      title: "Great recipe",
      text: "",
    });
  });

  it("finds the address in the text, as Android shares it, and keeps the words around it", () => {
    expect(interpretShare({ title: "Pancakes", text: "Try this https://food.example.com/p?x=1 tonight." })).toEqual({
      url: "https://food.example.com/p?x=1",
      title: "Pancakes",
      text: "Try this tonight.",
    });
  });

  it("names a link by its host when there is no title, or the title is just the address", () => {
    expect(interpretShare({ text: "https://www.example.com/a/b" })).toMatchObject({
      url: "https://www.example.com/a/b",
      title: "example.com",
      text: "",
    });
    expect(interpretShare({ title: "https://www.example.com/a", url: "https://www.example.com/a" })).toMatchObject({
      title: "example.com",
      text: "",
    });
  });

  it("drops punctuation stuck to the end of an address", () => {
    expect(interpretShare({ text: "see (https://example.com/page)." }).url).toBe("https://example.com/page");
    expect(interpretShare({ text: "https://example.com/page, thanks" }).url).toBe("https://example.com/page");
  });

  it("only takes web addresses", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://example.com/x",
      "mailto:a@b.example",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(interpretShare({ url }).url, url).toBeNull();
    }
    expect(interpretShare({ text: "javascript:alert(1) and more words" })).toEqual({
      url: null,
      title: "",
      text: "javascript:alert(1) and more words",
    });
  });

  it("is plain text when there is no address", () => {
    expect(interpretShare({ title: " Shopping ", text: " milk  and\neggs " })).toEqual({
      url: null,
      title: "Shopping",
      text: "milk and eggs",
    });
    expect(interpretShare({})).toEqual({ url: null, title: "", text: "" });
  });

  it("keeps a title within what a note allows", () => {
    expect(interpretShare({ title: "t".repeat(500), url: "https://example.com" }).title).toHaveLength(200);
  });
});

describe("hostOf", () => {
  it("drops www and the path", () => {
    expect(hostOf("https://www.example.com/a?b=1")).toBe("example.com");
    expect(hostOf("nonsense")).toBe("nonsense");
  });
});

describe("describeShare", () => {
  const shared = (over: object = {}) => ({ url: null, title: "", text: "", ...over });
  it("says what there is to save", () => {
    expect(describeShare(shared({ url: "https://a.example", title: "a.example" }), [])).toMatchObject({
      hasUrl: true,
      hasText: false,
      hasFiles: false,
    });
    expect(describeShare(shared({ text: "hello" }), [])).toMatchObject({ hasUrl: false, hasText: true });
    expect(describeShare(shared({ title: "just a title" }), [])).toMatchObject({ hasText: true });
    // with a photo, a title alone is the photo's name, not text worth a note
    expect(describeShare(shared({ title: "Receipt" }), [{ type: "image/png" }])).toMatchObject({
      hasText: false,
      hasImages: true,
    });
    expect(describeShare(shared({ title: "Receipt", text: "lunch" }), [{ type: "image/png" }])).toMatchObject({
      hasText: true,
    });
    expect(describeShare(shared(), [{ type: "image/jpeg" }, { type: "application/pdf" }])).toMatchObject({
      hasFiles: true,
      hasImages: true,
      imageCount: 1,
    });
    expect(describeShare(shared(), [{ type: "application/pdf" }])).toMatchObject({ hasFiles: true, hasImages: false });
  });
});
