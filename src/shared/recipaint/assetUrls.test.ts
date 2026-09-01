import { describe, it, expect } from "vitest";
import { filenameFromAssetUrl, thumbFilenameFor, thumbGcsPathFor, thumbUrlFor } from "./assetUrls";

const ORIGINAL = "https://storage.googleapis.com/bucket/recipaint-assets/mini-1712-9987.jpg";
const THUMB = "https://storage.googleapis.com/bucket/recipaint-assets/thumbs/mini-1712-9987.webp";

describe("thumbFilenameFor", () => {
  it("swaps the extension for webp", () => {
    expect(thumbFilenameFor("mini-1712-9987.jpg")).toBe("mini-1712-9987.webp");
    expect(thumbFilenameFor("shot.PNG")).toBe("shot.webp");
  });

  it("keeps dots inside the name", () => {
    expect(thumbFilenameFor("v1.2.final.png")).toBe("v1.2.final.webp");
  });

  it("appends an extension when there isn't one", () => {
    expect(thumbFilenameFor("noext")).toBe("noext.webp");
  });

  it("does not treat a leading dot as an extension", () => {
    expect(thumbFilenameFor(".hidden")).toBe(".hidden.webp");
  });
});

describe("thumbGcsPathFor", () => {
  it("puts the thumbnail in the thumbs folder", () => {
    expect(thumbGcsPathFor("mini-1712-9987.jpg")).toBe("recipaint-assets/thumbs/mini-1712-9987.webp");
  });
});

describe("filenameFromAssetUrl", () => {
  it("takes the last path segment", () => {
    expect(filenameFromAssetUrl(ORIGINAL)).toBe("mini-1712-9987.jpg");
  });

  it("drops a query string or fragment", () => {
    expect(filenameFromAssetUrl(`${ORIGINAL}?v=2`)).toBe("mini-1712-9987.jpg");
    expect(filenameFromAssetUrl(`${ORIGINAL}#x`)).toBe("mini-1712-9987.jpg");
  });
});

describe("thumbUrlFor", () => {
  it("maps an original onto its thumbnail", () => {
    expect(thumbUrlFor(ORIGINAL)).toBe(THUMB);
  });

  it("is idempotent - a thumbnail url maps to itself", () => {
    expect(thumbUrlFor(THUMB)).toBe(THUMB);
  });

  it("leaves a non-recipaint url alone", () => {
    const other = "https://storage.googleapis.com/bucket/blog-assets/pic.png";
    expect(thumbUrlFor(other)).toBe(other);
  });

  it("returns an empty string for blank input", () => {
    expect(thumbUrlFor("")).toBe("");
    expect(thumbUrlFor(null)).toBe("");
    expect(thumbUrlFor(undefined)).toBe("");
  });

  it("handles a url whose folder name appears earlier in the path", () => {
    const nested = "https://cdn/recipaint-assets/x/recipaint-assets/mini.jpg";
    expect(thumbUrlFor(nested)).toBe("https://cdn/recipaint-assets/x/recipaint-assets/thumbs/mini.webp");
  });
});
