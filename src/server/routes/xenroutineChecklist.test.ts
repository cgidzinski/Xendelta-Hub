import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// A routine's checklist through the real routes and models: editing the steps, ticking them (shared by everyone on the
// routine), and what completing does with the ticks.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenroutine.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xenroutine${url}`).set(as(who)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xenroutine${url}`).set(as(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xenroutine${url}`).set(as(who)).send(body),
});
const make = async (who: U, extra: object = {}) => {
  const res = await api(who).post("/routines", {
    name: "Monthly car check",
    interval: { every: 1, unit: "months" },
    checklist: [{ text: "Tyre pressure" }, { text: "Oil" }, { text: "Lights" }],
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.routine as {
    _id: string;
    checklist: Array<{ _id: string; text: string; done: boolean }>;
    due_at: string;
  };
};
const get = async (who: U, id: string) =>
  (await api(who).get("/routines")).body.data.routines.find((r: any) => r._id === id);
const tick = (who: U, id: string, itemId: string, done: boolean) =>
  api(who).put(`/routines/${id}/checklist/${itemId}`, { done });
const share = async (owner: U, id: string, other: U) => {
  const res = await api(owner).post(`/routines/${id}/share`, { userIds: [String(other.user._id)] });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};

describe("a routine's checklist", () => {
  it("is made with the routine, in order, all unticked", async () => {
    const me = await createUser();
    const r = await make(me);
    expect(r.checklist.map((c) => [c.text, c.done])).toEqual([
      ["Tyre pressure", false],
      ["Oil", false],
      ["Lights", false],
    ]);
    expect(r.checklist.every((c) => /^[a-f0-9]{24}$/.test(c._id))).toBe(true);
  });

  it("is optional: a routine without one has an empty list", async () => {
    const me = await createUser();
    const r = await make(me, { checklist: undefined });
    expect(r.checklist).toEqual([]);
  });

  it("refuses blank steps, too long a step, and too many steps", async () => {
    const me = await createUser();
    const post = (checklist: unknown) =>
      api(me).post("/routines", { name: "x", interval: { every: 1, unit: "days" }, checklist });
    expect((await post([{ text: "   " }])).status).toBe(400);
    expect((await post([{ text: "x".repeat(101) }])).status).toBe(400);
    expect((await post(Array.from({ length: 31 }, (_, i) => ({ text: `step ${i}` })))).status).toBe(400);
    expect((await post(Array.from({ length: 30 }, (_, i) => ({ text: `step ${i}` })))).status).toBe(201);
    expect((await post([{ text: "ok", _id: "not-an-id" }])).status).toBe(400);
  });
});

describe("editing the steps", () => {
  it("keeps the tick of a step that stays, starts a new one unticked, and drops one that's gone", async () => {
    const me = await createUser();
    const r = await make(me);
    const [tyres, oil, lights] = r.checklist;
    await tick(me, r._id, tyres._id, true);
    await tick(me, r._id, lights._id, true);

    const edit = await api(me).put(`/routines/${r._id}`, {
      checklist: [
        { _id: lights._id, text: "Lights and indicators" }, // moved to the front and reworded: still ticked
        { _id: tyres._id, text: tyres.text },
        { text: "Washer fluid" }, // new
        // oil removed
      ],
    });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const after = (await get(me, r._id)).checklist;
    expect(after.map((c: any) => [c.text, c.done])).toEqual([
      ["Lights and indicators", true],
      ["Tyre pressure", true],
      ["Washer fluid", false],
    ]);
    expect(after.some((c: any) => c._id === oil._id)).toBe(false);
  });

  it("is left alone by an edit that doesn't mention it, and can be emptied", async () => {
    const me = await createUser();
    const r = await make(me);
    await api(me).put(`/routines/${r._id}`, { name: "Renamed" });
    expect((await get(me, r._id)).checklist).toHaveLength(3);
    await api(me).put(`/routines/${r._id}`, { checklist: [] });
    expect((await get(me, r._id)).checklist).toEqual([]);
  });

  it("is for the owner: someone it's shared with can tick but not change the steps", async () => {
    const [owner, friend] = await Promise.all([createUser(), createUser()]);
    const r = await make(owner);
    await share(owner, r._id, friend);
    const edit = await api(friend).put(`/routines/${r._id}`, { checklist: [{ text: "Mine now" }] });
    expect(edit.status).toBe(403);
    expect((await get(owner, r._id)).checklist).toHaveLength(3);
  });
});

describe("ticking steps", () => {
  it("ticks and unticks one step, and is shared with everyone on the routine", async () => {
    const [owner, friend] = await Promise.all([createUser(), createUser()]);
    const r = await make(owner);
    await share(owner, r._id, friend);

    const first = await tick(owner, r._id, r.checklist[1]._id, true);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.routine.checklist.map((c: any) => c.done)).toEqual([false, true, false]);
    // the friend sees it, and ticks another
    expect((await get(friend, r._id)).checklist.map((c: any) => c.done)).toEqual([false, true, false]);
    await tick(friend, r._id, r.checklist[0]._id, true);
    expect((await get(owner, r._id)).checklist.map((c: any) => c.done)).toEqual([true, true, false]);

    await tick(owner, r._id, r.checklist[1]._id, false);
    expect((await get(owner, r._id)).checklist.map((c: any) => c.done)).toEqual([true, false, false]);
  });

  it("doesn't lose ticks made at the same moment", async () => {
    const me = await createUser();
    const r = await make(me);
    await Promise.all(r.checklist.map((c) => tick(me, r._id, c._id, true)));
    expect((await get(me, r._id)).checklist.every((c: any) => c.done)).toBe(true);
  });

  it("refuses a stranger, a step that isn't on the routine, and a bad request", async () => {
    const [me, stranger] = await Promise.all([createUser(), createUser()]);
    const r = await make(me);
    expect((await tick(stranger, r._id, r.checklist[0]._id, true)).status).toBe(404);
    expect((await get(me, r._id)).checklist.every((c: any) => !c.done)).toBe(true);

    const other = await make(me, { name: "Other", checklist: [{ text: "Elsewhere" }] });
    expect((await tick(me, r._id, other.checklist[0]._id, true)).status).toBe(404); // a step of another routine
    expect((await tick(me, r._id, new mongoose.Types.ObjectId().toString(), true)).status).toBe(404);
    expect((await api(me).put(`/routines/${r._id}/checklist/${r.checklist[0]._id}`, { done: "yes" })).status).toBe(400);
    expect((await api(me).put(`/routines/${r._id}/checklist/not-an-id`, { done: true })).status).toBe(400);
    expect(
      (
        await request(t.app)
          .put(`/api/xenroutine/routines/${r._id}/checklist/${r.checklist[0]._id}`)
          .send({ done: true })
      ).status,
    ).toBe(401);
  });
});

describe("completing a routine with a checklist", () => {
  it("records what was ticked and resets every tick for the next time", async () => {
    const me = await createUser();
    const r = await make(me);
    await tick(me, r._id, r.checklist[0]._id, true);
    await tick(me, r._id, r.checklist[2]._id, true);

    const done = await api(me).post(`/routines/${r._id}/complete`, { note: "All fine", expected_due_at: r.due_at });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const after = done.body.data.routine;
    expect(after.checklist.map((c: any) => c.done)).toEqual([false, false, false]);
    expect(after.checklist.map((c: any) => c._id)).toEqual(r.checklist.map((c) => c._id)); // the same steps
    expect(after.history[0]).toMatchObject({
      action: "done",
      note: "All fine",
      steps_done: ["Tyre pressure", "Lights"],
      steps_total: 3,
    });
  });

  it("records every step when all were ticked, and none when none were", async () => {
    const me = await createUser();
    const r = await make(me);
    const none = await api(me).post(`/routines/${r._id}/complete`, {});
    expect(none.body.data.routine.history[0]).toMatchObject({ steps_done: [], steps_total: 3 });
    await Promise.all(r.checklist.map((c) => tick(me, r._id, c._id, true)));
    const all = await api(me).post(`/routines/${r._id}/complete`, {});
    expect(all.body.data.routine.history[0]).toMatchObject({
      steps_done: ["Tyre pressure", "Oil", "Lights"],
      steps_total: 3,
    });
  });

  it("a routine without a checklist records nothing extra", async () => {
    const me = await createUser();
    const r = await make(me, { checklist: [] });
    const done = await api(me).post(`/routines/${r._id}/complete`, {});
    expect(done.body.data.routine.history[0]).not.toHaveProperty("steps_total");
    expect(done.body.data.routine.history[0]).not.toHaveProperty("steps_done");
  });

  it("completing a later occurrence ahead of time leaves this occurrence's ticks alone", async () => {
    const me = await createUser();
    const r = await make(me);
    await tick(me, r._id, r.checklist[1]._id, true);
    const ahead = await api(me).post(`/routines/${r._id}/complete`, { occurrence: 2, expected_due_at: r.due_at });
    expect(ahead.status, JSON.stringify(ahead.body)).toBe(200);
    expect(ahead.body.data.routine.checklist.map((c: any) => c.done)).toEqual([false, true, false]);
    expect(ahead.body.data.routine.history[0]).not.toHaveProperty("steps_total");
  });

  it("postponing doesn't touch the ticks", async () => {
    const me = await createUser();
    const r = await make(me);
    await tick(me, r._id, r.checklist[0]._id, true);
    const postponed = await api(me).post(`/routines/${r._id}/postpone`, { days: 2 });
    expect(postponed.status).toBe(200);
    expect(postponed.body.data.routine.checklist.map((c: any) => c.done)).toEqual([true, false, false]);
  });
});
