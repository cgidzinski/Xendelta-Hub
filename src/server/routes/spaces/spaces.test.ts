import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
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

const make = async (me: U, name = "Crew") => {
  const res = await request(t.app).post("/api/spaces").set(as(me.token)).send({ name });
  expect(res.status).toBe(200);
  return res.body.data.space as any;
};
/** Put someone in a space directly: invites come later (#311). */
const addMember = async (spaceId: string, who: U) => {
  const { Space } = await import("../../models/space.js");
  await Space.updateOne({ _id: spaceId }, { $push: { members: { user_id: id(who), role: "member" } } }).exec();
};

describe("making and reading a space", () => {
  it("the maker owns it, and it starts with the everyone role", async () => {
    const a = await createUser();
    const space = await make(a, "  Crew  ");
    expect(space.name).toBe("Crew");
    expect(space.ownerId).toBe(id(a));
    expect(space.members).toEqual([expect.objectContaining({ user_id: id(a), role: "owner", roleIds: [] })]);
    expect(space.roles).toEqual([expect.objectContaining({ name: "everyone", everyone: true })]);
    expect(space.permissions).toContain("manageSpace");
    expect(space.people.map((p: any) => p._id)).toEqual([id(a)]);
  });

  it("lists only my spaces", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const mine = await make(a, "Mine");
    await make(b, "Theirs");
    const res = await request(t.app).get("/api/spaces").set(as(a.token));
    expect(res.body.data.spaces.map((s: any) => s._id)).toEqual([mine._id]);
  });

  it("answers 404 to someone who is not in it, so ids can't be probed", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    expect((await request(t.app).get(`/api/spaces/${space._id}`).set(as(b.token))).status).toBe(404);
    expect((await request(t.app).get(`/api/spaces/${space._id}`).set(as(a.token))).status).toBe(200);
  });

  it("a plain member sees what they may do", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const res = await request(t.app).get(`/api/spaces/${space._id}`).set(as(b.token));
    expect(res.body.data.space.permissions.sort()).toEqual(["invite", "readMessages", "sendMessages"]);
  });

  it("rejects an empty or oversized name, and a bad id", async () => {
    const a = await createUser();
    expect((await request(t.app).post("/api/spaces").set(as(a.token)).send({ name: "  " })).status).toBe(400);
    expect(
      (
        await request(t.app)
          .post("/api/spaces")
          .set(as(a.token))
          .send({ name: "x".repeat(61) })
      ).status,
    ).toBe(400);
    expect((await request(t.app).get("/api/spaces/nope").set(as(a.token))).status).toBe(400);
  });

  it("limits how many spaces a person can be in", async () => {
    const a = await createUser();
    const { Space } = await import("../../models/space.js");
    await Space.insertMany(
      Array.from({ length: 50 }, (_, i) => ({ name: `S${i}`, members: [{ user_id: id(a), role: "owner" }] })),
    );
    expect((await request(t.app).post("/api/spaces").set(as(a.token)).send({ name: "One more" })).status).toBe(400);
  });
});

describe("renaming and deleting", () => {
  it("the owner renames, a plain member can't, and members hear about it", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    expect(
      (await request(t.app).patch(`/api/spaces/${space._id}`).set(as(b.token)).send({ name: "Mine" })).status,
    ).toBe(403);
    sent = [];
    const res = await request(t.app).patch(`/api/spaces/${space._id}`).set(as(a.token)).send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.data.space.name).toBe("Renamed");
    expect(
      sent
        .filter((e) => e.event === "space:updated")
        .map((e) => e.room)
        .sort(),
    ).toEqual([`user:${id(a)}`, `user:${id(b)}`].sort());
  });

  it("only the owner deletes, and everyone is told they're out", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    expect((await request(t.app).delete(`/api/spaces/${space._id}`).set(as(b.token))).status).toBe(403);
    sent = [];
    expect((await request(t.app).delete(`/api/spaces/${space._id}`).set(as(a.token))).status).toBe(200);
    expect((await request(t.app).get(`/api/spaces/${space._id}`).set(as(a.token))).status).toBe(404);
    expect(
      sent
        .filter((e) => e.payload?.removed)
        .map((e) => e.room)
        .sort(),
    ).toEqual([`user:${id(a)}`, `user:${id(b)}`].sort());
  });
});

describe("leaving, removing and handing over", () => {
  it("a member can leave, the owner can't", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    expect((await request(t.app).delete(`/api/spaces/${space._id}/membership`).set(as(a.token))).status).toBe(400);
    expect((await request(t.app).delete(`/api/spaces/${space._id}/membership`).set(as(b.token))).status).toBe(200);
    expect((await request(t.app).get(`/api/spaces/${space._id}`).set(as(b.token))).status).toBe(404);
  });

  it("removing someone needs the kick permission, and the owner can't be removed", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    await addMember(space._id, c);
    expect(
      (
        await request(t.app)
          .delete(`/api/spaces/${space._id}/members/${id(c)}`)
          .set(as(b.token))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .delete(`/api/spaces/${space._id}/members/${id(a)}`)
          .set(as(a.token))
      ).status,
    ).toBe(400);
    const res = await request(t.app)
      .delete(`/api/spaces/${space._id}/members/${id(c)}`)
      .set(as(a.token));
    expect(res.status).toBe(200);
    expect(res.body.data.space.members.map((m: any) => m.user_id).sort()).toEqual([id(a), id(b)].sort());
    expect((await request(t.app).get(`/api/spaces/${space._id}`).set(as(c.token))).status).toBe(404);
    expect(
      (
        await request(t.app)
          .delete(`/api/spaces/${space._id}/members/${id(c)}`)
          .set(as(a.token))
      ).status,
    ).toBe(404);
  });

  it("the owner hands the space over and then can leave", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    expect(
      (
        await request(t.app)
          .patch(`/api/spaces/${space._id}/owner`)
          .set(as(b.token))
          .send({ userId: id(b) })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .patch(`/api/spaces/${space._id}/owner`)
          .set(as(a.token))
          .send({ userId: id(c) })
      ).status,
    ).toBe(404);
    const res = await request(t.app)
      .patch(`/api/spaces/${space._id}/owner`)
      .set(as(a.token))
      .send({ userId: id(b) });
    expect(res.status).toBe(200);
    expect(res.body.data.space.ownerId).toBe(id(b));
    expect(res.body.data.space.members.filter((m: any) => m.role === "owner")).toHaveLength(1);
    expect((await request(t.app).delete(`/api/spaces/${space._id}/membership`).set(as(a.token))).status).toBe(200);
  });
});
