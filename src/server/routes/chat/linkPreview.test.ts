import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";
import { extractUrls, parsePreview, clearPreviewCache } from "../../chat/linkPreview";

// Which pages the fake network knows, by address. A page not listed can't be reached.
const { pages, fetched } = vi.hoisted(() => ({
  pages: new Map<string, { html: string; finalUrl?: string }>(),
  fetched: [] as string[],
}));
vi.mock("../../utils/safeFetch", () => ({
  fetchPublic: vi.fn(async (url: string) => {
    fetched.push(url);
    const page = pages.get(url);
    if (!page) throw new Error("unreachable");
    return { url: page.finalUrl ?? url, body: Buffer.from(page.html), contentType: "text/html" };
  }),
}));

describe("extractUrls", () => {
  it("finds web addresses, trims trailing punctuation, and lists each once", () => {
    expect(
      extractUrls("see https://example.com/a, and https://example.com/a. also (https://b.example/x?y=1)!"),
    ).toEqual(["https://example.com/a", "https://b.example/x?y=1"]);
  });
  it("ignores addresses inside code", () => {
    expect(
      extractUrls(
        "run `curl https://evil.example/x` or\n```\nhttps://also.example/y\n```\nthen https://real.example/z",
      ),
    ).toEqual(["https://real.example/z"]);
  });
  it("takes at most three, and only http and https", () => {
    expect(extractUrls("https://a.example/1 https://a.example/2 https://a.example/3 https://a.example/4")).toHaveLength(
      3,
    );
    expect(extractUrls("ftp://x.example/y javascript:alert(1) file:///etc/passwd")).toEqual([]);
  });
});

describe("parsePreview", () => {
  const page = (head: string) => `<html><head>${head}</head><body>x</body></html>`;
  it("reads Open Graph, in any attribute order and quote style", () => {
    const p = parsePreview(
      page(`<meta content='A &amp; B &#39;story&#39;' property="og:title"><meta property="og:description" content="It is  long
        and wrapped"><meta property="og:site_name" content="The Site"><title>ignored</title>`),
      "https://example.com/x",
    );
    expect(p).toEqual({
      url: "https://example.com/x",
      title: "A & B 'story'",
      description: "It is long and wrapped",
      siteName: "The Site",
    });
  });
  it("falls back to Twitter tags, then the page title and description", () => {
    expect(
      parsePreview(
        page(`<meta name="twitter:title" content="T"><meta name="twitter:description" content="D">`),
        "https://www.example.com/",
      ),
    ).toMatchObject({ title: "T", description: "D", siteName: "example.com" });
    expect(
      parsePreview(
        page(`<title> Plain title </title><meta name="description" content="Plain d">`),
        "https://example.com/",
      ),
    ).toMatchObject({ title: "Plain title", description: "Plain d" });
  });
  it("is null when the page says nothing, and keeps only text", () => {
    expect(parsePreview(page(""), "https://example.com/")).toBeNull();
    const p = parsePreview(
      page(
        `<meta property="og:title" content="<script>alert(1)</script> hi"><meta property="og:image" content="https://tracker.example/pixel.png">`,
      ),
      "https://example.com/",
    );
    // It is text from here on (the screen draws it escaped), and the picture the page names is not kept.
    expect(p).toEqual({
      url: "https://example.com/",
      title: "<script>alert(1)</script> hi",
      description: "",
      siteName: "example.com",
    });
  });
  it("cuts long text", () => {
    const p = parsePreview(page(`<meta property="og:title" content="${"a".repeat(500)}">`), "https://example.com/");
    expect(p!.title.length).toBeLessThanOrEqual(120);
    expect(p!.title.endsWith("…")).toBe(true);
  });
});

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("../communities/index.js"), () => import("./index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  pages.clear();
  fetched.length = 0;
  clearPreviewCache();
});

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const html = (title: string, description = "") =>
  `<html><head><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"></head></html>`;

const setup = async () => {
  const [a, b] = [await createUser(), await createUser()];
  const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
    .community;
  const { Community } = await import("../../models/community.js");
  await Community.updateOne(
    { _id: community._id },
    { $push: { members: { user_id: String(b.user._id), role: "member" } } },
  );
  const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
    .channels;
  return { a, b, channelId: general._id as string };
};
const send = (who: U, channelId: string, body: string) =>
  request(t.app).post(`/api/chat/conversations/${channelId}/messages`).set(as(who)).send({ body });
const messages = async (who: U, channelId: string) =>
  (await request(t.app).get(`/api/chat/conversations/${channelId}/messages`).set(as(who))).body.data.messages as any[];

describe("link previews on messages", () => {
  it("a sent message gets a preview a moment later, and the send itself doesn't wait for it", async () => {
    const { a, b, channelId } = await setup();
    pages.set("https://news.example/story", { html: html("Big story", "All about it") });
    const sent = await send(a, channelId, "read https://news.example/story please");
    expect(sent.status).toBe(200);
    await vi.waitFor(async () => expect((await messages(b, channelId))[0].embeds).toHaveLength(1));
    expect((await messages(b, channelId))[0].embeds[0]).toEqual({
      url: "https://news.example/story",
      title: "Big story",
      description: "All about it",
      siteName: "news.example",
    });
  });

  it("uses the address the link ended up at, and fetches one address only once", async () => {
    const { a, b, channelId } = await setup();
    pages.set("https://short.example/x", { html: html("Landed"), finalUrl: "https://long.example/landing" });
    await send(a, channelId, "https://short.example/x");
    await vi.waitFor(async () => expect((await messages(b, channelId))[0].embeds).toHaveLength(1));
    expect((await messages(b, channelId))[0].embeds[0].url).toBe("https://long.example/landing");
    await send(b, channelId, "again https://short.example/x");
    await vi.waitFor(async () => expect((await messages(a, channelId))[0].embeds).toHaveLength(1));
    expect(fetched.filter((u) => u === "https://short.example/x")).toHaveLength(1);
  });

  it("a page that can't be reached just has no preview, and the message is fine", async () => {
    const { a, channelId } = await setup();
    const sent = await send(a, channelId, "https://gone.example/page");
    expect(sent.status).toBe(200);
    await vi.waitFor(() => expect(fetched).toContain("https://gone.example/page"));
    expect((await messages(a, channelId))[0].embeds).toEqual([]);
  });

  it("addresses in code get no preview, and a message with no link fetches nothing", async () => {
    const { a, channelId } = await setup();
    await send(a, channelId, "`https://code.example/x` and plain words");
    await new Promise((r) => setTimeout(r, 150));
    expect(fetched).toEqual([]);
  });

  it("the sender can take the previews off, and editing doesn't bring them back; someone else can't", async () => {
    const { a, b, channelId } = await setup();
    pages.set("https://news.example/story", { html: html("Big story") });
    const sent = (await send(a, channelId, "https://news.example/story")).body.data.message;
    await vi.waitFor(async () => expect((await messages(a, channelId))[0].embeds).toHaveLength(1));
    const url = `/api/chat/conversations/${channelId}/messages/${sent.seq}`;
    expect((await request(t.app).delete(`${url}/embeds`).set(as(b))).status).toBe(403);
    const removed = await request(t.app).delete(`${url}/embeds`).set(as(a));
    expect(removed.status).toBe(200);
    expect(removed.body.data.message.embeds).toEqual([]);
    await request(t.app).patch(url).set(as(a)).send({ body: "edited https://news.example/story" });
    await new Promise((r) => setTimeout(r, 200));
    expect((await messages(a, channelId))[0].embeds).toEqual([]);
  });

  it("editing a message updates its previews", async () => {
    const { a, channelId } = await setup();
    pages.set("https://one.example/", { html: html("One") });
    pages.set("https://two.example/", { html: html("Two") });
    const sent = (await send(a, channelId, "https://one.example/")).body.data.message;
    await vi.waitFor(async () => expect((await messages(a, channelId))[0].embeds[0]?.title).toBe("One"));
    await request(t.app)
      .patch(`/api/chat/conversations/${channelId}/messages/${sent.seq}`)
      .set(as(a))
      .send({ body: "now https://two.example/" });
    await vi.waitFor(async () => expect((await messages(a, channelId))[0].embeds[0]?.title).toBe("Two"));
    await request(t.app)
      .patch(`/api/chat/conversations/${channelId}/messages/${sent.seq}`)
      .set(as(a))
      .send({ body: "no link now" });
    await vi.waitFor(async () => expect((await messages(a, channelId))[0].embeds).toEqual([]));
  });
});
