import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// A routine that repeats by a reading (an oil change every 5,000 km) instead of by time.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenroutine.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const api = (who: U) => ({
  get: (url: string) =>
    request(t.app)
      .get(`/api/xenroutine${url}`)
      .set({ Authorization: `Bearer ${who.token}` }),
  post: (url: string, body: object = {}) =>
    request(t.app)
      .post(`/api/xenroutine${url}`)
      .set({ Authorization: `Bearer ${who.token}` })
      .send(body),
});
const find = async (who: U, id: string) =>
  (await api(who).get("/routines")).body.data.routines.find((r: any) => r._id === id);

const makeOil = async (who: U) => {
  const res = await api(who).post("/routines", {
    name: "Oil change",
    kind: "threshold",
    threshold: { unit: "km", every: 5000, last_done_value: 25000, current_value: 26000 },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.routine;
};

describe("reading-based routines", () => {
  it("is armed, becomes due at the target, and re-targets from the actual completion reading", async () => {
    const me = await createUser();
    const r = await makeOil(me);
    expect(r.kind).toBe("threshold");
    expect(r.status).toBe("ok");
    expect(r.threshold.target).toBe(30000);

    await api(me).post(`/routines/${r._id}/reading`, { value: 29000 });
    expect((await find(me, r._id)).status).toBe("ok");
    await api(me).post(`/routines/${r._id}/reading`, { value: 30100 });
    expect((await find(me, r._id)).status).toBe("overdue");

    const done = await api(me).post(`/routines/${r._id}/complete`, { reading: 30200 });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const after = await find(me, r._id);
    expect(after.status).toBe("ok");
    expect(after.threshold.target).toBe(35200);
  });

  it("undo puts the old baseline back", async () => {
    const me = await createUser();
    const r = await makeOil(me);
    await api(me).post(`/routines/${r._id}/reading`, { value: 31000 });
    await api(me).post(`/routines/${r._id}/complete`, { reading: 31000 });
    expect((await find(me, r._id)).threshold.target).toBe(36000);
    expect((await api(me).post(`/routines/${r._id}/undo`)).status).toBe(200);
    const back = await find(me, r._id);
    expect(back.threshold.target).toBe(30000);
    expect(back.status).toBe("overdue");
  });

  it("rejects postponing, a reading on a time routine, and a missing threshold", async () => {
    const me = await createUser();
    const r = await makeOil(me);
    expect((await api(me).post(`/routines/${r._id}/postpone`, { days: 3 })).status).toBe(400);
    const timed = (await api(me).post("/routines", { name: "Filter", interval: { every: 1, unit: "months" } })).body
      .data.routine;
    expect((await api(me).post(`/routines/${timed._id}/reading`, { value: 1 })).status).toBe(400);
    expect((await api(me).post("/routines", { name: "Bad", kind: "threshold" })).status).toBe(400);
  });
});
