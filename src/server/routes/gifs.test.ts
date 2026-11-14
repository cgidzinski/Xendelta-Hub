import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { clearGifCache } from "../gifs/giphy";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./gifs.js"), () => import("./chat/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const KEY = "secret-key-123";
const item = (n: number, host = "media2.giphy.com") => ({
  title: `gif ${n}`,
  images: {
    fixed_height: { url: `https://${host}/media/${n}/200.gif`, width: "300", height: "200" },
    fixed_height_still: { url: `https://${host}/media/${n}/200_s.gif`, width: "300", height: "200" },
  },
});
const reply = (data: unknown[], total = 100, count = data.length) =>
  new Response(JSON.stringify({ data, pagination: { total_count: total, count } }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.GIPHY_API_KEY = KEY;
  clearGifCache();
  fetchMock = vi.fn(async () => reply([item(1), item(2)]));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  delete process.env.GIPHY_API_KEY;
  vi.unstubAllGlobals();
});

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const search = (who: U, q: Record<string, string | number> = {}) =>
  request(t.app).get("/api/gifs").set(as(who)).query(q);

describe("GIF search", () => {
  it("returns the pictures the picker needs, and never the key", async () => {
    const a = await createUser();
    const res = await search(a, { q: "cats" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.gifs).toEqual([
      {
        url: "https://media2.giphy.com/media/1/200.gif",
        stillUrl: "https://media2.giphy.com/media/1/200_s.gif",
        width: 300,
        height: 200,
        title: "gif 1",
      },
      {
        url: "https://media2.giphy.com/media/2/200.gif",
        stillUrl: "https://media2.giphy.com/media/2/200_s.gif",
        width: 300,
        height: 200,
        title: "gif 2",
      },
    ]);
    expect(res.body.data.next).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    // the request to GIPHY carried the key; the client's did not
    const asked = String(fetchMock.mock.calls[0][0]);
    expect(asked).toContain("/search");
    expect(asked).toContain("q=cats");
    expect(asked).toContain(`api_key=${KEY}`);
  });

  it("with no words, lists what is trending", async () => {
    const a = await createUser();
    await search(a);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/trending");
  });

  it("remembers an answer for a while, so a busy chat doesn't spend the quota", async () => {
    const a = await createUser();
    await search(a, { q: "dogs" });
    await search(a, { q: "dogs" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await search(a, { q: "dogs", offset: 24 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("leaves out pictures that aren't on GIPHY's own hosts", async () => {
    fetchMock.mockResolvedValueOnce(reply([item(1), item(2, "evil.example.com")]));
    const a = await createUser();
    const res = await search(a, { q: "x" });
    expect(res.body.data.gifs).toHaveLength(1);
  });

  it("says there is no more when the results run out", async () => {
    fetchMock.mockResolvedValueOnce(reply([item(1)], 1));
    const a = await createUser();
    expect((await search(a, { q: "rare" })).body.data.next).toBeNull();
  });

  it("answers plainly when GIPHY is down, without the key or the address", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const a = await createUser();
    const res = await search(a, { q: "x" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    expect(JSON.stringify(res.body)).not.toContain("giphy.com");
  });

  it("validates its input and needs a sign-in", async () => {
    const a = await createUser();
    expect((await search(a, { q: "x".repeat(51) })).status).toBe(400);
    expect((await search(a, { offset: -1 })).status).toBe(400);
    expect((await search(a, { offset: 99999 })).status).toBe(400);
    expect((await request(t.app).get("/api/gifs")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is off, and says so, without a key", async () => {
    delete process.env.GIPHY_API_KEY;
    const a = await createUser();
    expect((await request(t.app).get("/api/gifs/status").set(as(a))).body.data).toEqual({ enabled: false });
    expect((await search(a, { q: "x" })).status).toBe(503);
    process.env.GIPHY_API_KEY = KEY;
    expect((await request(t.app).get("/api/gifs/status").set(as(a))).body.data).toEqual({ enabled: true });
  });
});

describe("sending a GIF", () => {
  const gif = {
    url: "https://media2.giphy.com/media/1/200.gif",
    stillUrl: "https://media2.giphy.com/media/1/200_s.gif",
    width: 300,
    height: 200,
    title: "gif 1",
  };
  const chatWith = async (a: U, b: U) =>
    (
      await request(t.app)
        .post("/api/chat/conversations")
        .set(as(a))
        .send({ userIds: [String(b.user._id)] })
    ).body.data.conversation._id as string;

  it("is a message with a GIF and no text, and the chat list says so", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await chatWith(a, b);
    const res = await request(t.app).post(`/api/chat/conversations/${chat}/messages`).set(as(a)).send({ gif });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.message).toMatchObject({ body: "", gif });
    const list = (await request(t.app).get("/api/chat/conversations").set(as(b))).body.data.conversations;
    expect(list[0].lastMessage.preview).toBe("Sent a GIF");
  });

  it("only takes GIFs hosted by GIPHY, so a message can't point readers anywhere else", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await chatWith(a, b);
    const send = (g: unknown) =>
      request(t.app).post(`/api/chat/conversations/${chat}/messages`).set(as(a)).send({ gif: g });
    expect((await send({ ...gif, url: "https://evil.example.com/x.gif" })).status).toBe(400);
    expect((await send({ ...gif, stillUrl: "http://media2.giphy.com/x.gif" })).status).toBe(400);
    expect((await send({ ...gif, url: "https://giphy.com.evil.example/x.gif" })).status).toBe(400);
    expect((await send({ ...gif, width: 0 })).status).toBe(400);
    expect((await send({ ...gif, width: 99999 })).status).toBe(400);
  });
});
