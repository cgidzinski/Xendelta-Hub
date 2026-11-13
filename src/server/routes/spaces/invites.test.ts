import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

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

const make = async (me: U) => {
  const res = await request(t.app).post("/api/spaces").set(as(me.token)).send({ name: "Crew" });
  return res.body.data.space as any;
};
const invite = (spaceId: string, by: U, to: U[]) =>
  request(t.app)
    .post(`/api/spaces/${spaceId}/invites`)
    .set(as(by.token))
    .send({ userIds: to.map(id) });
const mine = async (u: U) =>
  (await request(t.app).get("/api/space-invites").set(as(u.token))).body.data.invites as any[];
const answer = (spaceId: string, u: U, accept: boolean) =>
  request(t.app).put(`/api/space-invites/${spaceId}`).set(as(u.token)).send({ accept });

describe("inviting", () => {
  it("invites a person, who is told, and who sees it in their list", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    const res = await invite(space._id, a, [b]);
    expect(res.status).toBe(200);
    expect(res.body.data.invited).toBe(1);

    expect(sent.filter((e) => e.event === "space:invite").map((e) => e.room)).toEqual([`user:${id(b)}`]);
    const { Notification } = await import("../../models/notification.js");
    await vi.waitFor(async () => expect(await Notification.countDocuments({ userId: id(b) })).toBe(1));
    expect((await Notification.findOne({ userId: id(b) }))!.message).toContain("Crew");

    const list = await mine(b);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ spaceId: space._id, spaceName: "Crew", memberCount: 1 });
    expect(list[0].invitedBy._id).toBe(id(a));
    // Not a member yet: they can't see inside.
    expect((await request(t.app).get(`/api/spaces/${space._id}`).set(as(b.token))).status).toBe(404);
  });

  it("asking twice, or inviting someone already in, does nothing", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await invite(space._id, a, [b]);
    sent = [];
    expect((await invite(space._id, a, [b])).body.data.invited).toBe(0);
    expect((await invite(space._id, a, [a])).body.data.invited).toBe(0);
    expect(sent).toEqual([]);
    expect(await mine(b)).toHaveLength(1);
  });

  it("only existing people, and only with the invite permission", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    const ghost = new mongoose.Types.ObjectId().toString();
    expect(
      (
        await request(t.app)
          .post(`/api/spaces/${space._id}/invites`)
          .set(as(a.token))
          .send({ userIds: [ghost] })
      ).status,
    ).toBe(404);
    expect(
      (await request(t.app).post(`/api/spaces/${space._id}/invites`).set(as(a.token)).send({ userIds: [] })).status,
    ).toBe(400);
    expect(
      (
        await request(t.app)
          .post(`/api/spaces/${space._id}/invites`)
          .set(as(a.token))
          .send({ userIds: ["nope"] })
      ).status,
    ).toBe(400);
    expect((await invite(space._id, b, [c])).status).toBe(404);

    // Members can invite by default; take the permission away from everyone and they can't.
    await invite(space._id, a, [b]);
    await answer(space._id, b, true);
    const everyone = space.roles.find((r: any) => r.everyone)._id;
    await request(t.app)
      .patch(`/api/spaces/${space._id}/roles/${everyone}`)
      .set(as(a.token))
      .send({ permissions: ["readMessages", "sendMessages"] });
    expect((await invite(space._id, b, [c])).status).toBe(403);
    expect((await invite(space._id, a, [c])).status).toBe(200);
  });

  it("limits how many a person can send in an hour", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    const { SpaceInvite } = await import("../../models/spaceInvite.js");
    await SpaceInvite.insertMany(
      Array.from({ length: 30 }, () => ({
        spaceId: new mongoose.Types.ObjectId().toString(),
        userId: new mongoose.Types.ObjectId().toString(),
        invitedBy: id(a),
      })),
    );
    expect((await invite(space._id, a, [b])).status).toBe(429);
  });
});

describe("managing pending invites", () => {
  it("shows pending invites to people who can invite, and lets them take one back", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    await invite(space._id, a, [b]);

    const list = await request(t.app).get(`/api/spaces/${space._id}/invites`).set(as(a.token));
    expect(list.body.data.invites).toEqual([
      expect.objectContaining({ invitedBy: id(a), person: expect.objectContaining({ _id: id(b) }) }),
    ]);
    expect((await request(t.app).get(`/api/spaces/${space._id}/invites`).set(as(c.token))).status).toBe(404);

    sent = [];
    expect(
      (
        await request(t.app)
          .delete(`/api/spaces/${space._id}/invites/${id(b)}`)
          .set(as(a.token))
      ).status,
    ).toBe(200);
    expect(sent.map((e) => e.room)).toEqual([`user:${id(b)}`]);
    expect(await mine(b)).toEqual([]);
    expect(
      (
        await request(t.app)
          .delete(`/api/spaces/${space._id}/invites/${id(b)}`)
          .set(as(a.token))
      ).status,
    ).toBe(404);
    expect((await answer(space._id, b, true)).status).toBe(404);
  });
});

describe("answering an invite", () => {
  it("accepting makes the person a member with the everyone role, who can then read the channels", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await invite(space._id, a, [b]);
    sent = [];
    const res = await answer(space._id, b, true);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ joined: true, spaceId: space._id });
    expect(await mine(b)).toEqual([]);

    const got = (await request(t.app).get(`/api/spaces/${space._id}`).set(as(b.token))).body.data.space;
    expect(got.members.find((m: any) => m.user_id === id(b))).toMatchObject({ role: "member", roleIds: [] });
    expect(got.permissions.sort()).toEqual(["invite", "readMessages", "sendMessages"]);
    expect(
      (await request(t.app).get(`/api/spaces/${space._id}/channels`).set(as(b.token))).body.data.channels,
    ).toHaveLength(1);
    // The people already in hear that someone joined.
    expect(
      sent
        .filter((e) => e.event === "space:updated")
        .map((e) => e.room)
        .sort(),
    ).toEqual([`user:${id(a)}`, `user:${id(b)}`].sort());
    // Answering again: it's gone.
    expect((await answer(space._id, b, true)).status).toBe(404);
  });

  it("declining removes the invite and joins nothing", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await invite(space._id, a, [b]);
    expect((await answer(space._id, b, false)).body.data.joined).toBe(false);
    expect(await mine(b)).toEqual([]);
    expect((await request(t.app).get(`/api/spaces/${space._id}`).set(as(b.token))).status).toBe(404);
  });

  it("only the person invited can answer", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    await invite(space._id, a, [b]);
    expect((await answer(space._id, c, true)).status).toBe(404);
    expect((await answer(space._id, a, true)).status).toBe(404);
    expect((await request(t.app).put(`/api/space-invites/${space._id}`).set(as(b.token)).send({})).status).toBe(400);
    expect(await mine(b)).toHaveLength(1);
  });

  it("refuses when the person is already in as many spaces as allowed", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await invite(space._id, a, [b]);
    const { Space } = await import("../../models/space.js");
    await Space.insertMany(
      Array.from({ length: 50 }, (_, i) => ({ name: `S${i}`, members: [{ user_id: id(b), role: "owner" }] })),
    );
    expect((await answer(space._id, b, true)).status).toBe(400);
  });

  it("deleting the space removes its invites, and the invite list skips it", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await invite(space._id, a, [b]);
    await request(t.app).delete(`/api/spaces/${space._id}`).set(as(a.token));
    expect(await mine(b)).toEqual([]);
    const { SpaceInvite } = await import("../../models/spaceInvite.js");
    expect(await SpaceInvite.countDocuments({ spaceId: space._id })).toBe(0);
  });
});
