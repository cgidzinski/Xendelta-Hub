import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// The everyday path of a community through the real routes, models and validation: make one, invite someone, they
// join, they chat in a channel, a channel is closed to them, they leave, and it is deleted. Like coreFlows.test.ts, it
// exists so that if the main calls stop working together, this fails even when the narrower tests still pass.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./communities/index.js"), () => import("./chat/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("community everyday flow", () => {
  it("create, invite, join, chat, restrict a channel, leave and delete", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const [A, B] = [a.user._id.toString(), b.user._id.toString()];
    const api = (who: typeof a, method: "get" | "post" | "put" | "patch" | "delete", url: string) =>
      request(t.app)[method](url).set(auth(who.token));

    // A makes a community and gets a general channel.
    const made = await api(a, "post", "/api/communities").send({ name: "Crew" });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const community = made.body.data.community;
    const base = `/api/communities/${community._id}`;
    const channels = (await api(a, "get", `${base}/channels`)).body.data.channels;
    expect(channels.map((c: any) => c.name)).toEqual(["general"]);
    const general = channels[0]._id;

    // B can't see it until invited, then sees the invitation and joins.
    expect((await api(b, "get", base)).status).toBe(404);
    expect((await api(a, "post", `${base}/invites`).send({ userIds: [B] })).body.data.invited).toBe(1);
    expect((await api(b, "get", "/api/community-invites")).body.data.invites).toHaveLength(1);
    expect(
      (await api(b, "put", `/api/community-invites/${community._id}`).send({ accept: true })).body.data.joined,
    ).toBe(true);
    expect((await api(b, "get", base)).status).toBe(200);

    // They now count as people each other know, and share the community.
    const { knownPeopleOf, sharedSpacesBetween } = await import("../social/index.js");
    expect((await knownPeopleOf(A)).map((p) => p._id)).toContain(B);
    expect((await sharedSpacesBetween(A, B)).map((s) => s.app)).toContain("community");

    // B posts in general, and A reads it.
    const sent = await api(b, "post", `/api/chat/conversations/${general}/messages`).send({ body: "hello crew" });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    const history = await api(a, "get", `/api/chat/conversations/${general}/messages`);
    expect(history.body.data.messages.map((m: any) => m.body)).toEqual(["hello crew"]);
    expect((await api(a, "get", "/api/chat/unread")).body.data.count).toBe(1);

    // A makes the channel read-only for everyone: B can still read, but not post.
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    const closed = await api(a, "put", `${base}/channels/${general}/overrides`).send({
      overrides: [{ roleId: everyone, allow: [], deny: ["sendMessages"] }],
    });
    expect(closed.status).toBe(200);
    expect((await api(b, "get", `/api/chat/conversations/${general}/messages`)).status).toBe(200);
    expect((await api(b, "post", `/api/chat/conversations/${general}/messages`).send({ body: "again" })).status).toBe(
      403,
    );

    // B leaves, and A deletes the community with its messages.
    expect((await api(b, "delete", `${base}/membership`)).status).toBe(200);
    expect((await api(b, "get", base)).status).toBe(404);
    expect((await api(a, "delete", base)).status).toBe(200);
    expect((await api(a, "get", base)).status).toBe(404);
    expect((await api(a, "get", `/api/chat/conversations/${general}/messages`)).status).toBe(404);
  });
});
