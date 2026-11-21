import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import {
  defaultXenStartConfig,
  QUICK_LINK_LIMIT,
  widgetLayout,
  type WidgetLayout,
  type XenStartConfig,
} from "@shared/xenstart";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";

const { fetchPublic } = vi.hoisted(() => ({ fetchPublic: vi.fn() }));
vi.mock("../utils/safeFetch", () => ({ fetchPublic }));

let t: TestApp;
const path = "/api/xenstart";
const usagePath = "/api/feed/usage";

beforeAll(async () => {
  t = await startTestApp([() => import("./xenstart.js"), () => import("./feed/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const link = (label: string, url = "https://example.com") => ({ id: randomUUID(), label, url });
const get = (token: string) => request(t.app).get(path).set(auth(token));
const save = (token: string, config: XenStartConfig) => request(t.app).put(path).set(auth(token)).send(config);

describe("XenStart", () => {
  it("persists sparse quick-link slots and background sizing and rejects invalid values", async () => {
    const { token } = await createUser();
    const links = [
      { ...link("First"), slot: 0 },
      { ...link("Last"), slot: 8 },
    ];
    const saved = (await save(token, { ...defaultXenStartConfig(), links, backgroundFit: "contain" }).expect(200)).body
      .data;
    expect((await get(token).expect(200)).body.data).toMatchObject({ links, backgroundFit: "contain" });
    const { backgroundFit: _fit, ...olderClient } = saved;
    expect((await save(token, olderClient).expect(200)).body.data.backgroundFit).toBe("contain");
    await save(token, { ...saved, links: [links[0], { ...links[1], slot: 0 }] }).expect(400);
    await save(token, { ...saved, links: [{ ...links[0], slot: QUICK_LINK_LIMIT }] }).expect(400);
    await request(t.app)
      .put(path)
      .set(auth(token))
      .send({ ...saved, backgroundFit: "invalid" })
      .expect(400);
  });

  it("persists region overrides, retains them on older requests, and resets without moving widgets", async () => {
    const { token } = await createUser();
    const initial = defaultXenStartConfig();
    const layout: WidgetLayout = { ...widgetLayout(initial), top: ["clock"], bottom: ["today"] };
    const preferences = {
      top: { alignment: "center", height: 2 },
      bottom: { height: null, alignment: "start", paddingTop: 48 },
      right: { paddingTop: 16 },
    } as const;
    const saved = (await save(token, { ...initial, layout, regionStyles: preferences }).expect(200)).body.data;
    expect((await get(token).expect(200)).body.data).toMatchObject({ regionStyles: preferences, layout });
    const { regionStyles: _regionStyles, ...oldRequest } = saved;
    const retained = (await save(token, oldRequest).expect(200)).body.data;
    expect(retained.regionStyles).toEqual(preferences);
    await save(token, { ...retained, regionStyles: { right: { height: 2 } } }).expect(400);
    await save(token, { ...retained, regionStyles: { bottom: { paddingTop: 7 } } }).expect(400);
    await save(token, { ...retained, regionStyles: { top: { height: 5 } } }).expect(400);
    await save(token, { ...saved, regionStyles: {} }).expect(409);
    await save(token, {
      ...retained,
      regionStyles: { top: { height: 1 }, bottom: { alignment: "end", paddingTop: 0 } },
    }).expect(200);
    expect((await get(token).expect(200)).body.data).toMatchObject({ regionStyles: {}, layout });
  });
  it("persists quick-link changes and preferences for the current account", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const token = user.token;
    const initial = defaultXenStartConfig();
    expect((await get(token).expect(200)).body.data).toEqual(initial);
    const a = link("A");
    const b = link("B");
    const first = (await save(token, { ...initial, links: [a, b], engine: "Bing", sections: ["activity"] }).expect(200))
      .body.data;
    expect(first.revision).toBe(1);
    expect((await get(token).expect(200)).body.data).toEqual(first);

    const edited = { ...a, label: "Edited", url: "http://example.net/folder" };
    const reordered = (
      await save(token, { ...first, links: [b, edited], sections: ["pinned", "attention"] }).expect(200)
    ).body.data;
    expect((await get(token).expect(200)).body.data).toEqual({ ...reordered, links: [b, edited], engine: "Bing" });
    await save(token, { ...reordered, links: [] }).expect(200);
    expect((await get(token).expect(200)).body.data.links).toEqual([]);
    expect((await request(t.app).get(usagePath).set(auth(token)).expect(200)).body.data.used).toContain("xenstart");
    expect((await get(other.token).expect(200)).body.data).toEqual(initial);
    await save(other.token, first).expect(409);
    expect((await get(other.token).expect(200)).body.data).toEqual(initial);
  });

  it("requires authentication and validates URLs, limits and settings", async () => {
    const initial = defaultXenStartConfig();
    const { token } = await createUser();
    await request(t.app).get(path).expect(401);
    await request(t.app).put(path).send(initial).expect(401);
    const a = link("A");
    const invalid = [
      { ...initial, links: [link("A", "javascript:alert(1)")] },
      { ...initial, links: [link("A", "example.com")] },
      { ...initial, links: [link("A", "https://user:password@example.com")] },
      { ...initial, links: [link(" ")] },
      { ...initial, links: [a, a] },
      { ...initial, links: Array.from({ length: QUICK_LINK_LIMIT + 1 }, () => link("A")) },
      { ...initial, engine: "Other" },
      { ...initial, clockFormat: "other" },
      { ...initial, sections: ["activity", "activity"] },
      { ...initial, sections: ["other"] },
    ];
    for (const config of invalid) {
      await request(t.app).put(path).set(auth(token)).send(config).expect(400);
    }
    expect((await get(token).expect(200)).body.data).toEqual(initial);
  });

  it("allows only one write per revision, including concurrent first saves", async () => {
    const { token } = await createUser();
    const first = defaultXenStartConfig();
    for (const revision of [0, 1]) {
      const results = await Promise.all([
        save(token, { ...first, revision, engine: "Bing" }),
        save(token, { ...first, revision, engine: "DuckDuckGo" }),
      ]);
      expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
      const winner = results.find((response) => response.status === 200);
      expect((await get(token).expect(200)).body.data).toEqual(winner?.body.data);
    }
  });

  it("keeps links when the grid shrinks and restores their order when it grows", async () => {
    const { token } = await createUser();
    const initial = defaultXenStartConfig();
    const links = Array.from({ length: 15 }, (_, index) => link(`Link ${index + 1}`));
    const appearance = { rows: 3, columns: 5, backgroundUrl: "https://example.com/photo.jpg", showClock: true };
    const expanded = (await save(token, { ...initial, links, appearance }).expect(200)).body.data;
    const shrunk = (await save(token, { ...expanded, appearance: { ...appearance, rows: 1, columns: 2 } }).expect(200))
      .body.data;
    expect((await get(token).expect(200)).body.data).toEqual({ ...shrunk, links });
    const { appearance: _preferences, ...olderClient } = shrunk;
    const legacySave = await request(t.app).put(path).set(auth(token)).send(olderClient).expect(200);
    expect(legacySave.body.data.appearance).toEqual(shrunk.appearance);
    await save(token, { ...legacySave.body.data, appearance }).expect(200);
    expect((await get(token).expect(200)).body.data).toMatchObject({ links, appearance });

    for (const patch of [{ columns: 7 }, { rows: 0 }, { backgroundUrl: "http://example.com/photo.jpg" }]) {
      await save(token, { ...initial, appearance: { ...appearance, ...patch } }).expect(400);
    }
  });

  it("carries forward legacy placements and keeps widget preferences across place, remove and re-add", async () => {
    const { token } = await createUser();
    const initial = defaultXenStartConfig();
    expect(widgetLayout(initial).center).toEqual(["search", "links"]);
    const links = [link("First"), link("Second")];
    const legacy = (
      await save(token, {
        ...initial,
        links,
        engine: "Bing",
        sections: ["activity", "pinned"],
        appearance: { ...initial.appearance, rows: 3, showClock: true },
      }).expect(200)
    ).body.data as XenStartConfig;
    expect(widgetLayout(legacy)).toEqual({
      top: [],
      center: ["clock", "search", "links"],
      left: [],
      right: [],
      bottom: ["pinned", "activity"],
    });

    const empty = { top: [], center: [], left: [], right: [], bottom: [] };
    const removed = (await save(token, { ...legacy, layout: empty }).expect(200)).body.data as XenStartConfig;
    expect((await get(token).expect(200)).body.data).toMatchObject({
      layout: empty,
      links,
      engine: "Bing",
      sections: [],
      appearance: { rows: 3, showClock: false },
    });

    const { layout: _layout, ...olderClient } = removed;
    const updated = (
      await save(token, {
        ...olderClient,
        sections: ["pinned"],
        appearance: { ...removed.appearance, showClock: true },
      }).expect(200)
    ).body.data;
    expect(updated.layout).toEqual(empty);
    expect(updated.sections).toEqual([]);
    expect(updated.appearance.showClock).toBe(false);

    const layout = { ...empty, top: ["search"], right: ["links", "clock"], left: ["pinned", "today"] } as const;
    const restored = (await save(token, { ...updated, layout }).expect(200)).body.data;
    expect(restored).toMatchObject({
      layout,
      links,
      engine: "Bing",
      sections: ["pinned"],
      appearance: { rows: 3, showClock: true },
    });
    await save(token, { ...updated, layout: empty }).expect(409);
    await save(token, { ...restored, layout: { ...layout, bottom: ["clock"] } }).expect(400);
    await save(token, { ...restored, layout: { ...layout, bottom: ["weather"] } }).expect(400);
    expect((await get(token).expect(200)).body.data).toEqual(restored);
  });

  it("keeps the clock format when an older client omits it or the clock is removed", async () => {
    const { token } = await createUser();
    const initial = defaultXenStartConfig();
    const layout = widgetLayout(initial);
    const saved = (
      await save(token, {
        ...initial,
        clockFormat: "24-hour",
        layout: { ...layout, top: ["clock"] },
      }).expect(200)
    ).body.data as XenStartConfig;
    const { clockFormat: _clockFormat, ...olderClient } = saved;
    const removed = (await save(token, { ...olderClient, layout }).expect(200)).body.data;
    expect(removed.clockFormat).toBe("24-hour");
    expect((await get(token).expect(200)).body.data.clockFormat).toBe("24-hour");
  });

  it("keeps widget sizes and favicons after saving and accepts older size-less updates", async () => {
    const { token } = await createUser();
    const links = [{ ...link("Example"), iconUrl: "https://example.com/icons/bookmark.png" }];
    const saved = (
      await save(token, {
        ...defaultXenStartConfig(),
        clockSize: "large",
        linkTileSize: "small",
        links,
      }).expect(200)
    ).body.data;
    const { clockSize: _clockSize, linkTileSize: _tileSize, ...olderClient } = saved;
    await save(token, olderClient).expect(200);
    expect((await get(token).expect(200)).body.data).toMatchObject({
      clockSize: "large",
      linkTileSize: "small",
      links,
    });
    await request(t.app)
      .put(path)
      .set(auth(token))
      .send({ ...saved, clockSize: "huge" })
      .expect(400);
  });

  it("suggests a title and the page’s favicon, with a fallback when a site is unavailable", async () => {
    const { token } = await createUser();
    const bookmarkPath = `${path}/bookmark`;
    const lookup = (url: string) => request(t.app).post(bookmarkPath).set(auth(token)).send({ url });
    await request(t.app).post(bookmarkPath).send({ url: "https://example.com" }).expect(401);
    await lookup("javascript:alert(1)").expect(400);
    fetchPublic.mockResolvedValueOnce({
      url: "https://example.com/articles/one",
      body: Buffer.from('<title>News &amp; Notes</title><link rel="shortcut icon" href="../icons/site.png">'),
    });
    expect((await lookup("https://www.example.com").expect(200)).body.data).toEqual({
      label: "News & Notes",
      iconUrl: "https://example.com/icons/site.png",
    });
    fetchPublic.mockRejectedValueOnce(new Error("Page unavailable"));
    expect((await lookup("https://www.example.com").expect(200)).body.data).toEqual({ label: "example.com" });
  });

  it("stores one private background, keeps it through other edits, and clears it on replacement or removal", async () => {
    const [owner, other] = await Promise.all([createUser(), createUser()]);
    const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "white" } })
      .png()
      .toBuffer();
    const upload = (config: XenStartConfig, bytes = png) =>
      request(t.app)
        .put(path)
        .set(auth(owner.token))
        .field("config", JSON.stringify(config))
        .attach("background", bytes, "background.png");
    const initial = defaultXenStartConfig();
    await upload(initial, Buffer.from("not an image")).expect(400);
    expect((await get(owner.token).expect(200)).body.data).toEqual(initial);

    const uploaded = (await upload(initial).expect(200)).body.data;
    const imagePath = `${path}/background/${uploaded.backgroundImageId}`;
    expect(uploaded).not.toHaveProperty("backgroundImage");
    expect((await get(owner.token).expect(200)).body.data).toEqual(uploaded);
    const image = await request(t.app)
      .get(imagePath)
      .set(auth(owner.token))
      .expect("Content-Type", "image/webp")
      .expect(200);
    expect(await sharp(image.body).metadata()).toMatchObject({ format: "webp", width: 20, height: 10 });
    await request(t.app).get(imagePath).expect(401);
    await request(t.app).get(imagePath).set(auth(other.token)).expect(404);
    expect((await request(t.app).get(usagePath).set(auth(owner.token)).expect(200)).body.data.used).toContain(
      "xenstart",
    );

    const { backgroundImageId: _imageId, ...olderClient } = uploaded;
    const retained = (await save(owner.token, { ...olderClient, engine: "Bing" }).expect(200)).body.data;
    expect(retained.backgroundImageId).toBe(uploaded.backgroundImageId);
    await upload(uploaded).expect(409);
    const replaced = (await upload(retained).expect(200)).body.data;
    expect(replaced.backgroundImageId).not.toBe(uploaded.backgroundImageId);
    await request(t.app).get(imagePath).set(auth(owner.token)).expect(404);

    const removed = (await save(owner.token, { ...replaced, backgroundImageId: null }).expect(200)).body.data;
    expect(removed.backgroundImageId).toBeUndefined();
    await request(t.app).get(`${path}/background/${replaced.backgroundImageId}`).set(auth(owner.token)).expect(404);
    const restored = (await upload(removed).expect(200)).body.data;
    const backgroundUrl = "https://example.com/wallpaper.jpg";
    const remote = (
      await save(owner.token, { ...restored, appearance: { ...restored.appearance, backgroundUrl } }).expect(200)
    ).body.data;
    expect(remote.backgroundImageId).toBeUndefined();
    expect(remote.appearance.backgroundUrl).toBe(backgroundUrl);
  });
});
