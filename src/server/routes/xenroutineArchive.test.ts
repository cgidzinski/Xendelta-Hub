import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Archiving puts a routine away (paused, out of reminders) without losing it or its history.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenroutine.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const put = (who: U, id: string, body: object) =>
  request(t.app).put(`/api/xenroutine/routines/${id}`).set(auth(who)).send(body);

describe("archiving a routine", () => {
  it("pauses it and keeps it, and restoring brings it back running", async () => {
    const me = await createUser();
    const made = await request(t.app)
      .post("/api/xenroutine/routines")
      .set(auth(me))
      .send({ name: "Filter", interval: { every: 1, unit: "months" } });
    const id = made.body.data.routine._id;
    expect(made.body.data.routine.archived).toBe(false);

    const archived = await put(me, id, { archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.data.routine).toMatchObject({ archived: true, enabled: false });
    const list = await request(t.app).get("/api/xenroutine/routines").set(auth(me));
    expect(list.body.data.routines.map((r: any) => r._id)).toContain(id);

    const restored = await put(me, id, { archived: false });
    expect(restored.body.data.routine).toMatchObject({ archived: false, enabled: true });
  });

  it("is only for the owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const made = await request(t.app)
      .post("/api/xenroutine/routines")
      .set(auth(owner))
      .send({ name: "Filter", interval: { every: 1, unit: "months" } });
    const res = await put(other, made.body.data.routine._id, { archived: true });
    expect(res.status).toBe(404);
  });
});
