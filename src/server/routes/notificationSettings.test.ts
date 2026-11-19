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

    const res = await save(token, { mutedNotifications: ["xensplit:email", "xenroutine:push", "xensplit:email"] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.user.mutedNotifications.sort()).toEqual(["xenroutine:push", "xensplit:email"]);
    expect((await profile(token)).mutedNotifications.sort()).toEqual(["xenroutine:push", "xensplit:email"]);

    await save(token, { mutedNotifications: [] });
    expect((await profile(token)).mutedNotifications).toEqual([]);
  });

  it("leaves the email switch alone, and the email switch leaves these alone", async () => {
    const { token } = await createUser();
    await save(token, { mutedNotifications: ["xennote:inapp"] });
    await save(token, { emailNotifications: false });
    const p = await profile(token);
    expect(p.emailNotifications).toBe(false);
    expect(p.mutedNotifications).toEqual(["xennote:inapp"]);
  });

  it("refuses an app or a way that doesn't exist", async () => {
    const { token } = await createUser();
    for (const bad of ["nope:push", "xensplit:carrier-pigeon", "xensplit", "xensplit:push:extra", ""]) {
      expect((await save(token, { mutedNotifications: [bad] })).status, bad).toBe(400);
    }
    expect((await save(token, { mutedNotifications: "xensplit:push" })).status).toBe(400);
  });
});
