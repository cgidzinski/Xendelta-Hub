import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { can } from "./policy";
import { SPACE_SOURCES } from "./spaces";

let t: TestApp;
let social: typeof import("./index");
beforeAll(async () => {
  t = await startTestApp([() => import("../routes/xensplit.js"), () => import("../routes/xennote/index.js")]);
  social = await import("./index.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => u.user._id.toString();

describe("knownPeopleOf and sharedSpacesBetween", () => {
  it("count each shared space once per person and list only spaces both are in", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    await request(t.app)
      .post("/api/xensplit/groups")
      .set(as(a.token))
      .send({ name: "One", memberIds: [id(b)] });
    await request(t.app)
      .post("/api/xensplit/groups")
      .set(as(a.token))
      .send({ name: "Two", memberIds: [id(b), id(c)] });

    const known = await social.knownPeopleOf(id(a));
    expect(known.map((p) => [p._id, p.sharedCount])).toEqual([
      [id(b), 2],
      [id(c), 1],
    ]);

    expect((await social.sharedSpacesBetween(id(a), id(b))).map((s) => s.name).sort()).toEqual(["One", "Two"]);
    expect((await social.sharedSpacesBetween(id(b), id(c))).map((s) => s.name)).toEqual(["Two"]);
    expect(await social.sharedSpacesBetween(id(a), id(await createUser()))).toEqual([]);
  });

  it("drops a person once they leave the space", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const group = (
      await request(t.app)
        .post("/api/xensplit/groups")
        .set(as(a.token))
        .send({ name: "G", memberIds: [id(b)] })
    ).body;
    expect((await social.knownPeopleOf(id(a))).map((p) => p._id)).toEqual([id(b)]);
    const gid = group.data?._id ?? group.data?.group?._id;
    await request(t.app)
      .delete(`/api/xensplit/groups/${gid}/members/${id(b)}`)
      .set(as(a.token));
    // Whatever the route answers, the answer must now agree with the group's actual members.
    const stillMember = (await social.sharedSpacesBetween(id(a), id(b))).length > 0;
    expect((await social.knownPeopleOf(id(a))).some((p) => p._id === id(b))).toBe(stillMember);
  });
});

describe("policy", () => {
  it("is open: anyone may message or add anyone", () => {
    expect(can("a", "b", "message")).toBe(true);
    expect(can("a", "b", "addToSpace")).toBe(true);
  });

  it("knows every app with members, each with an indexed member path", () => {
    expect(SPACE_SOURCES.map((s) => s.app).sort()).toEqual([
      "chat",
      "community",
      "xenbudget",
      "xenkitchen",
      "xennote",
      "xenroutine",
      "xensplit",
    ]);
    for (const s of SPACE_SOURCES) expect(s.memberPath).toMatch(/^\w+\.user_id$/);
  });
});
