import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// The per-app notification switches saved on the profile.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./users.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const profile = async (token: string) =>
  (await request(t.app).get("/api/user/profile").set(auth(token))).body.data.user;
const save = (token: string, body: object) => request(t.app).put("/api/user/profile").set(auth(token)).send(body);

describe("per-app notification settings", () => {
  it("starts with everything on, saves what is switched off, and replaces the list each time", async () => {
    const { token } = await createUser();
    expect((await profile(token)).mutedNotifications).toEqual([]);

    const res = await save(token, { mutedNotifications: ["xensplit:push", "xenroutine:push", "xensplit:push"] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.user.mutedNotifications.sort()).toEqual(["xenroutine:push", "xensplit:push"]);
    expect((await profile(token)).mutedNotifications.sort()).toEqual(["xenroutine:push", "xensplit:push"]);

    await save(token, { mutedNotifications: [] });
    expect((await profile(token)).mutedNotifications).toEqual([]);
  });

  it("has email off for every app until it is turned on, and the two lists leave each other alone", async () => {
    const { token } = await createUser();
    expect((await profile(token)).emailApps).toEqual([]);
    await save(token, { mutedNotifications: ["xennote:inapp"] });
    await save(token, { emailApps: ["xensplit", "xenroutine", "xensplit"] });
    const p = await profile(token);
    expect(p.emailApps.sort()).toEqual(["xenroutine", "xensplit"]);
    expect(p.mutedNotifications).toEqual(["xennote:inapp"]);
    await save(token, { emailApps: [] });
    expect((await profile(token)).emailApps).toEqual([]);
  });

  it("drops old per-app email entries from the switched-off list instead of refusing them", async () => {
    const { token } = await createUser();
    const res = await save(token, { mutedNotifications: ["xensplit:email", "xensplit:push"] });
    expect(res.status).toBe(200);
    expect((await profile(token)).mutedNotifications).toEqual(["xensplit:push"]);
  });

  it("refuses an app that doesn't exist in the email list", async () => {
    const { token } = await createUser();
    expect((await save(token, { emailApps: ["nope"] })).status).toBe(400);
  });

  it("refuses an app or a way that doesn't exist", async () => {
    const { token } = await createUser();
    for (const bad of ["nope:push", "xensplit:carrier-pigeon", "xensplit", "xensplit:push:extra", ""]) {
      expect((await save(token, { mutedNotifications: [bad] })).status, bad).toBe(400);
    }
    expect((await save(token, { mutedNotifications: "xensplit:push" })).status).toBe(400);
  });
});
