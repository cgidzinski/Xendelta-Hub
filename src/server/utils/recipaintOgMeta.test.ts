import { describe, it, expect } from "vitest";
import {
  RECIPAINT_SHARE_PATH,
  createRecipaintHtmlTransformer,
  buildRecipeMetaTags,
  escapeHtmlAttribute,
  injectMetaTags,
  toPreviewText,
} from "./recipaintOgMeta";

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Xendelta Hub</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("RECIPAINT_SHARE_PATH", () => {
  it("matches a bare 24-hex recipe id", () => {
    expect(RECIPAINT_SHARE_PATH.exec("/recipaint/507f1f77bcf86cd799439011")?.[1]).toBe("507f1f77bcf86cd799439011");
  });

  it("ignores everything else the SPA serves", () => {
    for (const path of [
      "/",
      "/internal/recipaint",
      "/internal/recipaint/507f1f77bcf86cd799439011",
      "/recipaint/507f1f77bcf86cd799439011/extra",
      "/recipaint/not-an-id",
      "/recipaint/507f1f77bcf86cd79943901", // 23 chars
    ]) {
      expect(RECIPAINT_SHARE_PATH.test(path), path).toBe(false);
    }
  });
});

describe("escapeHtmlAttribute", () => {
  it("neutralises a title that would otherwise break out of the attribute", () => {
    const escaped = escapeHtmlAttribute('Nurgle"><script>alert(1)</script>');
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("<");
    expect(escaped).toBe("Nurgle&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes ampersands before the entities it introduces", () => {
    expect(escapeHtmlAttribute('Rust & "grime"')).toBe("Rust &amp; &quot;grime&quot;");
  });
});

describe("toPreviewText", () => {
  it("flattens newlines into a single line", () => {
    expect(toPreviewText("First line\n\n  Second line ")).toBe("First line Second line");
  });

  it("clips long text with an ellipsis", () => {
    const out = toPreviewText("a".repeat(400));
    expect(out.length).toBe(200);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles null and undefined", () => {
    expect(toPreviewText(null)).toBe("");
    expect(toPreviewText(undefined)).toBe("");
  });
});

describe("buildRecipeMetaTags", () => {
  it("uses the first showcase image and the large-image card", () => {
    const tags = buildRecipeMetaTags(
      { title: "Necron Warrior", description: "Cold metal.", showcase: ["https://cdn/a.png", "https://cdn/b.png"] },
      "https://hub.example/recipaint/1",
    );
    expect(tags).toContain('<meta property="og:image" content="https://cdn/a.png" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(tags).toContain('<meta property="og:title" content="Necron Warrior" />');
    expect(tags).toContain('<meta property="og:url" content="https://hub.example/recipaint/1" />');
  });

  it("falls back to the small card and a default description with no images", () => {
    const tags = buildRecipeMetaTags({ title: "Untitled", showcase: [] }, "https://hub.example/recipaint/1");
    expect(tags).toContain('<meta name="twitter:card" content="summary" />');
    expect(tags).not.toContain("og:image");
    expect(tags).toContain("A step-by-step painting recipe");
  });

  it("escapes user text into the tags", () => {
    const tags = buildRecipeMetaTags({ title: 'Evil" onload="x', description: "<b>hi</b>" }, "https://h/x");
    expect(tags).toContain("&quot; onload=&quot;x");
    expect(tags).not.toMatch(/content="Evil" onload/);
    expect(tags).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });
});

describe("injectMetaTags", () => {
  it("inserts before </head> and retitles the document", () => {
    const out = injectMetaTags(SHELL, '<meta property="og:title" content="X" />', "Necron Warrior");
    expect(out).toContain("<title>Necron Warrior</title>");
    expect(out).not.toContain("<title>Xendelta Hub</title>");
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain('<div id="root">');
  });

  it("escapes the injected title", () => {
    const out = injectMetaTags(SHELL, "", '</title><script>alert(1)</script>');
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;/title&gt;");
  });

  it("returns the html untouched when there is no head", () => {
    const fragment = "<div>no head here</div>";
    expect(injectMetaTags(fragment, "<meta />", "T")).toBe(fragment);
  });
});

// The transformer itself: what actually reaches a crawler. The Mongo query is injected,
// so these exercise the real branching without a database.
describe("createRecipaintHtmlTransformer", () => {
  const req = (path: string) =>
    ({ path, protocol: "https", get: () => "hub.example" }) as unknown as import("express").Request;

  const SHARE = "/recipaint/507f1f77bcf86cd799439011";

  it("passes non-share paths straight through without querying at all", async () => {
    let calls = 0;
    const transform = createRecipaintHtmlTransformer(async () => {
      calls += 1;
      return null;
    });
    expect(await transform(SHELL, req("/internal/recipaint"))).toBe(SHELL);
    expect(await transform(SHELL, req("/"))).toBe(SHELL);
    expect(calls).toBe(0);
  });

  it("injects tags for a public recipe", async () => {
    const transform = createRecipaintHtmlTransformer(async () => ({
      isPublic: true,
      title: "Necron Warrior",
      description: "Cold metal.",
      showcase: ["https://cdn/a.png"],
    }));
    const out = await transform(SHELL, req(SHARE));
    expect(out).toContain('<meta property="og:title" content="Necron Warrior" />');
    expect(out).toContain('<meta property="og:image" content="https://cdn/a.png" />');
    expect(out).toContain(`content="https://hub.example${SHARE}"`);
    expect(out).toContain("<title>Necron Warrior</title>");
  });

  it("passes the recipe id from the url to the loader", async () => {
    let seen = "";
    const transform = createRecipaintHtmlTransformer(async (id) => {
      seen = id;
      return null;
    });
    await transform(SHELL, req(SHARE));
    expect(seen).toBe("507f1f77bcf86cd799439011");
  });

  it("leaks nothing about a private recipe", async () => {
    const transform = createRecipaintHtmlTransformer(async () => ({
      isPublic: false,
      title: "Secret Scheme",
      description: "hush",
    }));
    const out = await transform(SHELL, req(SHARE));
    expect(out).toBe(SHELL);
    expect(out).not.toContain("Secret Scheme");
  });

  it("serves the plain shell when the recipe is missing", async () => {
    const transform = createRecipaintHtmlTransformer(async () => null);
    expect(await transform(SHELL, req(SHARE))).toBe(SHELL);
  });

  it("never breaks the page when the query throws", async () => {
    const transform = createRecipaintHtmlTransformer(async () => {
      throw new Error("no connection");
    });
    expect(await transform(SHELL, req(SHARE))).toBe(SHELL);
  });

  it("gives up rather than stalling the page when the query hangs", async () => {
    const transform = createRecipaintHtmlTransformer(() => new Promise(() => {}));
    const started = Date.now();
    expect(await transform(SHELL, req(SHARE))).toBe(SHELL);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("prefers PUBLIC_URL over the request host when it is set", async () => {
    const previous = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = "https://canonical.example";
    try {
      const transform = createRecipaintHtmlTransformer(async () => ({ isPublic: true, title: "T" }));
      const out = await transform(SHELL, req(SHARE));
      expect(out).toContain(`content="https://canonical.example${SHARE}"`);
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_URL;
      else process.env.PUBLIC_URL = previous;
    }
  });
});
