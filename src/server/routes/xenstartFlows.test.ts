import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { defaultXenStartConfig, QUICK_LINK_LIMIT, type XenStartConfig } from "@shared/xenstart";
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
});
