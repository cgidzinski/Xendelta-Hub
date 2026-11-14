import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

// A community's fund: members donate gems, once per request, never more than they have; outsiders see nothing.

let t: TestApp;
let sent: Array<{ room: string; event: string; payload: any }> = [];

beforeAll(async () => {
  t = await startTestApp([() => import("./index.js")]);
  const { SocketManager } = await import("../../infrastructure/SocketManager.js");
  (SocketManager.getInstance() as any).io = {
    to: (room: string) => ({ emit: (event: string, payload: any) => sent.push({ room, event, payload }) }),
    sockets: { adapter: { rooms: new Map() } },
  };
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  sent = [];
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => String(u.user._id);
const gemsOf = async (u: U) => ((await mongoose.model("User").findById(u.user._id, "gems").lean()) as any).gems;
const rid = () => new mongoose.Types.ObjectId().toString();

const make = async (me: U) => {
  const res = await request(t.app).post("/api/communities").set(as(me.token)).send({ name: "Crew" });
  return res.body.data.community._id as string;
};
const addMember = async (communityId: string, who: U) => {
  const { Community } = await import("../../models/community.js");
  await Community.updateOne({ _id: communityId }, { $push: { members: { user_id: id(who), role: "member" } } }).exec();
};
const donate = (u: U, communityId: string, body: object) =>
  request(t.app).post(`/api/communities/${communityId}/fund/donate`).set(as(u.token)).send(body);
const fund = (u: U, communityId: string) => request(t.app).get(`/api/communities/${communityId}/fund`).set(as(u.token));

describe("community fund", () => {
  it("starts empty, with donations not offered while nothing bills communities", async () => {
    const owner = await createUser();
    const c = await make(owner);
    const res = await fund(owner, c);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ communityId: c, fund: 0, history: [], donationsOpen: false });
  });

  it("moves a member's gems into the fund once, even when the request is retried", async () => {
    const owner = await createUser();
    const member = await createUser({ gems: 100 });
    const c = await make(owner);
    await addMember(c, member);
    const body = { gems: 40, requestId: rid() };

    const first = await donate(member, c, body);
    const again = await donate(member, c, body);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ fund: 40, balance: 60 });
    expect(again.body.data).toEqual({ fund: 40, balance: 60 });
    expect(await gemsOf(member)).toBe(60);

    const realtime = sent.filter((s) => s.event === "community:fund");
    expect([...new Set(realtime.map((s) => s.room))].sort()).toEqual(
      [`user:${id(member)}`, `user:${id(owner)}`].sort(),
    );

    const history = (await fund(owner, c)).body.data.history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "donation", amount: 40, by: { _id: id(member) } });
  });

  it("refuses more than the donor has, and changes nothing", async () => {
    const owner = await createUser({ gems: 5 });
    const c = await make(owner);
    const res = await donate(owner, c, { gems: 6, requestId: rid() });
    expect(res.status).toBe(402);
    expect(await gemsOf(owner)).toBe(5);
    expect((await fund(owner, c)).body.data.fund).toBe(0);
  });

  it("is invisible to people outside the community", async () => {
    const owner = await createUser();
    const stranger = await createUser({ gems: 50 });
    const c = await make(owner);
    expect((await fund(stranger, c)).status).toBe(404);
    expect((await donate(stranger, c, { gems: 1, requestId: rid() })).status).toBe(404);
    expect(await gemsOf(stranger)).toBe(50);
  });

  it("validates the amount and the request id", async () => {
    const owner = await createUser({ gems: 50 });
    const c = await make(owner);
    for (const body of [
      { gems: 0, requestId: rid() },
      { gems: 1.5, requestId: rid() },
      { gems: 1 },
      { gems: 1, requestId: "x" },
    ]) {
      expect((await donate(owner, c, body)).status).toBe(400);
    }
  });
});
