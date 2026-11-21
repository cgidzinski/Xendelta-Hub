import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TIMER_PATH, type KitchenTimer } from "@shared/xenkitchen/timers";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";

let t: TestApp;
let sendAlerts: typeof import("../utils/xenKitchenTimerAlerts").sendKitchenTimerAlerts;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenkitchenTimers.js")]);
  ({ sendKitchenTimerAlerts: sendAlerts } = await import("../utils/xenKitchenTimerAlerts.js"));
  await mongoose.model("XenKitchenTimer").init();
}, 60_000);
afterAll(async () => {
  await t?.stop();
});
beforeEach(async () => {
  await mongoose.model("XenKitchenTimer").deleteMany({});
});

type Account = Awaited<ReturnType<typeof createUser>>;
const api = (who: Account) => ({
  get: () => request(t.app).get(TIMER_PATH).auth(who.token, { type: "bearer" }),
  start: (body: object) => request(t.app).post(TIMER_PATH).auth(who.token, { type: "bearer" }).send(body),
  act: (id: string, action: string, version: number) =>
    request(t.app).patch(`${TIMER_PATH}/${id}`).auth(who.token, { type: "bearer" }).send({ action, version }),
});
const startInput = (halfway = true) => ({ id: randomUUID(), durationSeconds: 120, halfway });

async function start(who: Account, halfway?: boolean): Promise<KitchenTimer> {
  const response = await api(who).start(startInput(halfway)).expect(200);
  return response.body.data;
}

describe("XenKitchen timer API", () => {
  it("isolates accounts and deduplicates repeated and concurrent recipe starts", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const source = { key: "recipe:step:1", label: "Salmon · Step 2" };
    const input = { ...startInput(), source };
    const results = await Promise.all([
      api(me).start(input).expect(200),
      api(me)
        .start({ ...input, id: randomUUID() })
        .expect(200),
      api(me).start(input).expect(200),
    ]);
    const timer = results[0].body.data;
    for (const result of results) expect(result.body.data.id).toBe(timer.id);
    expect((await api(me).get().expect(200)).body.data).toHaveLength(1);
    expect((await api(other).get().expect(200)).body.data).toEqual([]);
    await api(other).act(timer.id, "pause", 0).expect(404);
    await api(me)
      .start({ ...startInput(), durationSeconds: 0 })
      .expect(400);
    await request(t.app).get(TIMER_PATH).expect(401);
  });

  it("layers manual timers and safely retries pause, resume and dismissal", async () => {
    const me = await createUser();
    const [first, second] = await Promise.all([start(me), start(me)]);
    expect(new Set([first.label, second.label])).toEqual(new Set(["Timer 1", "Timer 2"]));
    const paused = (await api(me).act(first.id, "pause", 0).expect(200)).body.data;
    expect(paused).toMatchObject({ endAt: null, version: 1 });
    expect(paused.pausedMs).toBeGreaterThan(0);
    expect((await api(me).act(first.id, "pause", 0).expect(200)).body.data).toEqual(paused);
    const resumed = (await api(me).act(first.id, "resume", 1).expect(200)).body.data;
    expect(resumed).toMatchObject({ pausedMs: null, version: 2 });
    expect(resumed.halfwayAt).toBeGreaterThan(Date.now());
    await api(me).act(first.id, "dismiss", 2).expect(200);
    await api(me).act(first.id, "dismiss", 2).expect(200);
    expect((await api(me).get().expect(200)).body.data).toEqual([second]);
  });
});

describe("XenKitchen timer push", () => {
  it("claims halfway and completion once across overlapping job runs", async () => {
    const me = await createUser();
    const timer = await start(me);
    const send = vi.fn(async () => ({ sent: 1, pruned: 0 }));
    for (const timestamp of [timer.halfwayAt!, timer.endAt!]) {
      await Promise.all([sendAlerts(timestamp, send), sendAlerts(timestamp, send)]);
    }
    expect(send.mock.calls).toHaveLength(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      String(me.user._id),
      expect.objectContaining({
        title: "Halfway",
        url: `/internal/xenkitchen?timer=${timer.id}`,
      }),
      expect.objectContaining({ ttl: 30 }),
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      String(me.user._id),
      expect.objectContaining({ title: "Timer done" }),
      expect.anything(),
    );
  });

  it("skips expired and muted alerts and suppresses halfway once the timer is done", async () => {
    const me = await createUser();
    const muted = await createUser({ notificationPrefs: { muted: ["xenkitchen:push"] } });
    const [timer] = await Promise.all([start(me), start(muted, false)]);
    const send = vi.fn(async () => ({ sent: 1, pruned: 0 }));
    await sendAlerts(timer.endAt! + 1000, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      String(me.user._id),
      expect.objectContaining({ title: "Timer done" }),
      expect.anything(),
    );
    const stale = await start(me);
    await sendAlerts(stale.endAt! + 31_000, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
