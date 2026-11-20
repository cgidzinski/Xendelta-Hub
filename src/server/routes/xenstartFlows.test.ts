import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  defaultXenStartConfig,
  QUICK_LINK_LIMIT,
  widgetLayout,
  type WidgetLayout,
  type XenStartConfig,
} from "@shared/xenstart";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";

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
});
