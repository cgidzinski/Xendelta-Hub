import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenRoutine } from "../models/xenRoutine";
import { UNDO_WINDOW_MS } from "../utils/xenRoutine";

// Marking a routine done can be taken back for a few minutes by whoever did it, while it is still the latest thing.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenroutine.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xenroutine${url}`).set(auth(who)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xenroutine${url}`).set(auth(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xenroutine${url}`).set(auth(who)).send(body),
});
const make = async (who: U, extra: object = {}) => {
  const res = await api(who).post("/routines", {
    name: "Car check",
    interval: { every: 1, unit: "months" },
    checklist: [{ text: "Tyres" }, { text: "Oil" }],
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.routine as { _id: string; due_at: string; checklist: Array<{ _id: string }> };
};
const get = async (who: U, id: string) =>
  (await api(who).get("/routines")).body.data.routines.find((r: any) => r._id === id);

describe("undoing a completion", () => {
  it("puts the schedule, the ticks and the history back, and hides nothing from the list", async () => {
    const me = await createUser();
    const r = await make(me);
    await api(me).put(`/routines/${r._id}/checklist/${r.checklist[0]._id}`, { done: true });
    const before = await get(me, r._id);

    expect((await api(me).post(`/routines/${r._id}/complete`, {})).status).toBe(200);
    const done = await get(me, r._id);
    expect(done.due_at).not.toBe(before.due_at);
    expect(done.history).toHaveLength(1);
    expect(done.history[0].undo_state).toBeUndefined(); // never sent to the client

    const undone = await api(me).post(`/routines/${r._id}/undo`);
    expect(undone.status, JSON.stringify(undone.body)).toBe(200);
    const after = await get(me, r._id);
    expect(after.due_at).toBe(before.due_at);
    expect(after.last_done_at).toBe(before.last_done_at);
    expect(after.history).toEqual([]);
    expect(after.checklist.map((c: any) => c.done)).toEqual([true, false]);
  });

  it("can be done again after an undo, and only the latest completion can be undone", async () => {
    const me = await createUser();
    const r = await make(me, { checklist: [] });
    await api(me).post(`/routines/${r._id}/complete`, {});
    await api(me).post(`/routines/${r._id}/complete`, {});
    expect((await get(me, r._id)).history).toHaveLength(2);

    expect((await api(me).post(`/routines/${r._id}/undo`)).status).toBe(200);
    expect((await get(me, r._id)).history).toHaveLength(1);
    // The earlier completion lost its snapshot when the next one was made, so it can't be undone.
    expect((await api(me).post(`/routines/${r._id}/undo`)).status).toBe(409);
  });

  it("is refused after a postponement, for someone else's completion, and after the window", async () => {
    const owner = await createUser();
    const other = await createUser();
    const r = await make(owner, { checklist: [] });
    await api(owner).post(`/routines/${r._id}/share`, { userIds: [String(other.user._id)] });

    await api(owner).post(`/routines/${r._id}/complete`, {});
    expect((await api(other).post(`/routines/${r._id}/undo`)).status).toBe(409);

    await api(owner).post(`/routines/${r._id}/postpone`, { days: 1 });
    expect((await api(owner).post(`/routines/${r._id}/undo`)).status).toBe(409);

    await api(owner).post(`/routines/${r._id}/complete`, {});
    await XenRoutine.updateOne(
      { _id: r._id },
      { $set: { "history.$[last].at": new Date(Date.now() - UNDO_WINDOW_MS - 60_000) } },
      { arrayFilters: [{ "last.action": "done", "last.undo_state": { $exists: true } }] },
    );
    expect((await api(owner).post(`/routines/${r._id}/undo`)).status).toBe(409);
  });

  it("restores a routine completed ahead of time", async () => {
    const me = await createUser();
    const r = await make(me, { checklist: [] });
    const before = await get(me, r._id);
    expect((await api(me).post(`/routines/${r._id}/complete`, { occurrence: 2 })).status).toBe(200);
    expect((await get(me, r._id)).done_ahead_indices).toEqual([2]);
    expect((await api(me).post(`/routines/${r._id}/undo`)).status).toBe(200);
    const after = await get(me, r._id);
    expect(after.done_ahead_indices).toEqual([]);
    expect(after.due_at).toBe(before.due_at);
  });
});
