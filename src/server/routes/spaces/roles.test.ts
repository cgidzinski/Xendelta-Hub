import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp([() => import("./index.js"), () => import("../chat/index.js")]);
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => String(u.user._id);

const make = async (me: U) => {
  const res = await request(t.app).post("/api/spaces").set(as(me.token)).send({ name: "Crew" });
  return res.body.data.space as any;
};
const addMember = async (spaceId: string, who: U) => {
  const { Space } = await import("../../models/space.js");
  await Space.updateOne({ _id: spaceId }, { $push: { members: { user_id: id(who), role: "member" } } }).exec();
};
const getSpace = async (spaceId: string, me: U) =>
  (await request(t.app).get(`/api/spaces/${spaceId}`).set(as(me.token))).body.data.space as any;
const newRole = (spaceId: string, me: U, body: Record<string, unknown>) =>
  request(t.app).post(`/api/spaces/${spaceId}/roles`).set(as(me.token)).send(body);
const roleNamed = (space: any, name: string) => space.roles.find((r: any) => r.name === name);
const giveRoles = (spaceId: string, by: U, to: U, roleIds: string[]) =>
  request(t.app)
    .put(`/api/spaces/${spaceId}/members/${id(to)}/roles`)
    .set(as(by.token))
    .send({ roleIds });

describe("making and changing roles", () => {
  it("the owner makes a role just above everyone, and the order is highest first", async () => {
    const a = await createUser();
    const space = await make(a);
    const first = await newRole(space._id, a, {
      name: "mod",
      color: "#5b8def",
      permissions: ["manageMessages", "pinMessages"],
    });
    expect(first.status).toBe(200);
    const second = await newRole(space._id, a, { name: "helper", permissions: [] });
    const roles = second.body.data.space.roles;
    expect(roles.map((r: any) => [r.name, r.position])).toEqual([
      ["mod", 2],
      ["helper", 1],
      ["everyone", 0],
    ]);
    expect(roleNamed(second.body.data.space, "mod")).toMatchObject({
      color: "#5b8def",
      permissions: ["manageMessages", "pinMessages"],
    });
  });

  it("refuses bad names, colours and permissions", async () => {
    const a = await createUser();
    const space = await make(a);
    expect((await newRole(space._id, a, { name: " " })).status).toBe(400);
    expect((await newRole(space._id, a, { name: "x", color: "red" })).status).toBe(400);
    expect((await newRole(space._id, a, { name: "x", permissions: ["flyTheMoon"] })).status).toBe(400);
  });

  it("a plain member can't manage roles at all", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    expect((await newRole(space._id, b, { name: "x" })).status).toBe(403);
  });

  it("someone with manage roles can only hand out permissions they hold", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const admin = roleNamed(
      (await newRole(space._id, a, { name: "admin", permissions: ["manageRoles", "pinMessages"] })).body.data.space,
      "admin",
    );
    await giveRoles(space._id, a, b, [admin._id]);

    expect((await newRole(space._id, b, { name: "ok", permissions: ["pinMessages"] })).status).toBe(200);
    expect((await newRole(space._id, b, { name: "bad", permissions: ["manageSpace"] })).status).toBe(403);
    expect((await newRole(space._id, b, { name: "bad2", permissions: ["kickMembers"] })).status).toBe(403);
  });

  it("you can't edit or delete a role at or above your own, but can below it", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    // A new role goes just above everyone, so the first one made ranks highest.
    await newRole(space._id, a, { name: "high", permissions: ["manageRoles", "pinMessages"] });
    await newRole(space._id, a, { name: "mid", permissions: ["manageRoles", "pinMessages"] });
    const s = (await newRole(space._id, a, { name: "low", permissions: ["pinMessages"] })).body.data.space;
    const [low, mid, high] = [roleNamed(s, "low"), roleNamed(s, "mid"), roleNamed(s, "high")];
    await giveRoles(space._id, a, b, [mid._id]);

    const patch = (r: any, body: any) =>
      request(t.app).patch(`/api/spaces/${space._id}/roles/${r._id}`).set(as(b.token)).send(body);
    expect((await patch(high, { name: "nope" })).status).toBe(403);
    expect((await patch(mid, { name: "nope" })).status).toBe(403);
    expect((await patch(low, { name: "renamed" })).status).toBe(200);
    expect((await patch(low, { permissions: ["pinMessages", "kickMembers"] })).status).toBe(403);
    expect((await request(t.app).delete(`/api/spaces/${space._id}/roles/${high._id}`).set(as(b.token))).status).toBe(
      403,
    );
    expect((await request(t.app).delete(`/api/spaces/${space._id}/roles/${low._id}`).set(as(b.token))).status).toBe(
      200,
    );
  });

  it("everyone keeps its name and place, and can't be deleted, but its permissions can change", async () => {
    const a = await createUser();
    const space = await make(a);
    const everyone = roleNamed(space, "everyone");
    const url = `/api/spaces/${space._id}/roles/${everyone._id}`;
    expect((await request(t.app).patch(url).set(as(a.token)).send({ name: "all" })).status).toBe(400);
    expect((await request(t.app).delete(url).set(as(a.token))).status).toBe(400);
    const res = await request(t.app)
      .patch(url)
      .set(as(a.token))
      .send({ permissions: ["readMessages"] });
    expect(res.status).toBe(200);
    expect(roleNamed(res.body.data.space, "everyone").permissions).toEqual(["readMessages"]);
  });

  it("reorders roles, and must list every role once", async () => {
    const a = await createUser();
    const space = await make(a);
    await newRole(space._id, a, { name: "one" });
    const s = (await newRole(space._id, a, { name: "two" })).body.data.space;
    const [one, two] = [roleNamed(s, "one"), roleNamed(s, "two")];
    const put = (ids: string[]) =>
      request(t.app).put(`/api/spaces/${space._id}/roles/order`).set(as(a.token)).send({ ids });
    expect((await put([one._id])).status).toBe(400);
    expect((await put([one._id, one._id])).status).toBe(400);
    const res = await put([one._id, two._id]);
    expect(res.status).toBe(200);
    expect(res.body.data.space.roles.map((r: any) => r.name)).toEqual(["one", "two", "everyone"]);
  });
});

describe("giving roles to people", () => {
  it("assigns and takes away roles, and the member's permissions follow", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const pinner = roleNamed(
      (await newRole(space._id, a, { name: "pinner", permissions: ["pinMessages"] })).body.data.space,
      "pinner",
    );

    expect((await getSpace(space._id, b)).permissions).not.toContain("pinMessages");
    const given = await giveRoles(space._id, a, b, [pinner._id]);
    expect(given.status).toBe(200);
    expect((await getSpace(space._id, b)).permissions).toContain("pinMessages");
    await giveRoles(space._id, a, b, []);
    expect((await getSpace(space._id, b)).permissions).not.toContain("pinMessages");
  });

  it("refuses unknown roles, everyone, strangers and the owner", async () => {
    const [a, b, stranger] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const everyone = roleNamed(space, "everyone");
    expect((await giveRoles(space._id, a, b, [everyone._id])).status).toBe(400);
    expect((await giveRoles(space._id, a, b, ["64b64b64b64b64b64b64b64"])).status).toBe(400);
    expect((await giveRoles(space._id, a, stranger, [])).status).toBe(404);
    expect((await giveRoles(space._id, a, a, [])).status).toBe(400);
  });

  it("you can't give yourself a role, or change someone at your rank or above", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    await addMember(space._id, c);
    await newRole(space._id, a, { name: "admin", permissions: ["manageRoles"] });
    const s = (await newRole(space._id, a, { name: "low", permissions: [] })).body.data.space;
    const [low, admin] = [roleNamed(s, "low"), roleNamed(s, "admin")];
    await giveRoles(space._id, a, b, [admin._id]);
    await giveRoles(space._id, a, c, [admin._id]);

    expect((await giveRoles(space._id, b, b, [admin._id, low._id])).status).toBe(403);
    expect((await giveRoles(space._id, b, c, [admin._id, low._id])).status).toBe(403);
    expect((await giveRoles(space._id, b, c, [])).status).toBe(403);
    // Even giving up your own admin role: it is not below your own rank.
    expect((await giveRoles(space._id, b, b, [])).status).toBe(403);
  });

  it("deleting a role takes it from people and from channel overrides", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const pinner = roleNamed(
      (await newRole(space._id, a, { name: "pinner", permissions: ["pinMessages"] })).body.data.space,
      "pinner",
    );
    await giveRoles(space._id, a, b, [pinner._id]);
    const [general] = (await request(t.app).get(`/api/spaces/${space._id}/channels`).set(as(a.token))).body.data
      .channels;
    await request(t.app)
      .put(`/api/spaces/${space._id}/channels/${general._id}/overrides`)
      .set(as(a.token))
      .send({ overrides: [{ roleId: pinner._id, allow: ["sendMessages"], deny: [] }] });

    expect((await request(t.app).delete(`/api/spaces/${space._id}/roles/${pinner._id}`).set(as(a.token))).status).toBe(
      200,
    );
    expect((await getSpace(space._id, b)).members.find((m: any) => m.user_id === id(b)).roleIds).toEqual([]);
    const after = (await request(t.app).get(`/api/spaces/${space._id}/channels`).set(as(a.token))).body.data.channels;
    expect(after[0].overrides).toEqual([]);
  });
});

describe("channel overrides", () => {
  const put = (spaceId: string, channelId: string, me: U, overrides: unknown[]) =>
    request(t.app).put(`/api/spaces/${spaceId}/channels/${channelId}/overrides`).set(as(me.token)).send({ overrides });

  it("denying everyone read makes a channel private, and a role lets people back in", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    await addMember(space._id, c);
    const staff = roleNamed((await newRole(space._id, a, { name: "staff", permissions: [] })).body.data.space, "staff");
    await giveRoles(space._id, a, b, [staff._id]);
    const extra = (
      await request(t.app).post(`/api/spaces/${space._id}/channels`).set(as(a.token)).send({ name: "staff-room" })
    ).body.data.channel;
    const everyone = roleNamed(space, "everyone");

    const res = await put(space._id, extra._id, a, [
      { roleId: everyone._id, allow: [], deny: ["readMessages"] },
      { roleId: staff._id, allow: ["readMessages"], deny: [] },
    ]);
    expect(res.status).toBe(200);
    const names = async (u: U) =>
      (await request(t.app).get(`/api/spaces/${space._id}/channels`).set(as(u.token))).body.data.channels.map(
        (ch: any) => ch.name,
      );
    expect(await names(b)).toEqual(["general", "staff-room"]);
    expect(await names(c)).toEqual(["general"]);
  });

  it("is refused for a plain member, an unknown role, a space-level permission, or one that is both allowed and denied", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const [general] = (await request(t.app).get(`/api/spaces/${space._id}/channels`).set(as(a.token))).body.data
      .channels;
    const everyone = roleNamed(space, "everyone");
    expect((await put(space._id, general._id, b, [])).status).toBe(403);
    expect(
      (await put(space._id, general._id, a, [{ roleId: "64b64b64b64b64b64b64b64", allow: [], deny: [] }])).status,
    ).toBe(400);
    expect(
      (await put(space._id, general._id, a, [{ roleId: everyone._id, allow: ["manageSpace"], deny: [] }])).status,
    ).toBe(400);
    expect(
      (
        await put(space._id, general._id, a, [
          { roleId: everyone._id, allow: ["sendMessages"], deny: ["sendMessages"] },
        ])
      ).status,
    ).toBe(400);
    expect(
      (
        await put(space._id, general._id, a, [
          { roleId: everyone._id, allow: [], deny: [] },
          { roleId: everyone._id, allow: [], deny: [] },
        ])
      ).status,
    ).toBe(400);
  });

  it("someone with manage roles can't allow what they don't have", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const admin = roleNamed(
      (await newRole(space._id, a, { name: "admin", permissions: ["manageRoles"] })).body.data.space,
      "admin",
    );
    await giveRoles(space._id, a, b, [admin._id]);
    const [general] = (await request(t.app).get(`/api/spaces/${space._id}/channels`).set(as(a.token))).body.data
      .channels;
    const everyone = roleNamed(space, "everyone");
    expect(
      (await put(space._id, general._id, b, [{ roleId: everyone._id, allow: ["mentionEveryone"], deny: [] }])).status,
    ).toBe(403);
    expect(
      (await put(space._id, general._id, b, [{ roleId: everyone._id, allow: ["sendMessages"], deny: [] }])).status,
    ).toBe(200);
  });
});
