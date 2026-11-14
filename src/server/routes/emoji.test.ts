import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { CUSTOM_EMOJI_MAX_PER_SCOPE } from "@shared/emoji";

// Custom emoji through the real routes, models and Mongo. Only the bucket is faked, as an in-memory set of paths.
const { stored } = vi.hoisted(() => ({ stored: new Map<string, { type: string; size: number }>() }));
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async (buf: Buffer, path: string, type: string) => {
    stored.set(path, { type, size: buf.length });
    return `https://example.test/public/${path}`;
  }),
  deleteFromGCS: vi.fn(async (path: string) => void stored.delete(path)),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./emoji.js"),
    () => import("./communities/index.js"),
    () => import("./chat/index.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => stored.clear());

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const makeCommunity = async (me: U) =>
  (await request(t.app).post("/api/communities").set(as(me)).send({ name: "Crew" })).body.data.community;
const addToCommunity = async (communityId: string, who: U) => {
  const { Community } = await import("../models/community.js");
  await Community.updateOne({ _id: communityId }, { $push: { members: { user_id: id(who), role: "member" } } });
};
const makeChat = async (me: U, others: U[]) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(me))
      .send({ userIds: others.map(id), name: "Group" })
  ).body.data.conversation;
const upload = (
  who: U,
  fields: Record<string, string>,
  file: { buf: Buffer; name: string; type: string } | null = { buf: PNG, name: "e.png", type: "image/png" },
) => {
  const req = request(t.app).post("/api/emoji").set(as(who));
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  if (file) req.attach("file", file.buf, { filename: file.name, contentType: file.type });
  return req;
};
const list = async (who: U) => (await request(t.app).get("/api/emoji").set(as(who))).body.data.emoji as any[];

describe("a community's emoji", () => {
  it("the owner adds one, and everyone in the community sees it", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const community = await makeCommunity(a);
    await addToCommunity(community._id, b);
    const res = await upload(a, { name: "Party_Blob", scopeType: "community", scopeId: community._id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.emoji).toMatchObject({
      name: "party_blob",
      animated: false,
      scope: { type: "community", id: community._id },
      createdBy: id(a),
    });
    expect(res.body.data.emoji.url).toContain(`emoji/${community._id}/`);
    expect([...stored.keys()].some((p) => p.startsWith(`emoji/${community._id}/`))).toBe(true);
    expect((await list(b)).map((e) => e.name)).toEqual(["party_blob"]);
    expect(await list(outsider)).toEqual([]);
  });

  it("needs the manage emoji permission", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await makeCommunity(a);
    await addToCommunity(community._id, b);
    expect((await upload(b, { name: "nope", scopeType: "community", scopeId: community._id })).status).toBe(403);
    // A role with the permission lets a member add and remove.
    const role = await request(t.app)
      .post(`/api/communities/${community._id}/roles`)
      .set(as(a))
      .send({ name: "emoji", permissions: ["manageEmoji"] });
    const roleId = role.body.data.community.roles.find((r: any) => r.name === "emoji")._id;
    await request(t.app)
      .put(`/api/communities/${community._id}/members/${id(b)}/roles`)
      .set(as(a))
      .send({ roleIds: [roleId] });
    const added = await upload(b, { name: "mine", scopeType: "community", scopeId: community._id });
    expect(added.status).toBe(200);
    expect((await request(t.app).delete(`/api/emoji/${added.body.data.emoji._id}`).set(as(b))).status).toBe(200);
  });

  it("a stranger to the community gets a 404, not a clue", async () => {
    const [a, outsider] = [await createUser(), await createUser()];
    const community = await makeCommunity(a);
    expect((await upload(outsider, { name: "sneaky", scopeType: "community", scopeId: community._id })).status).toBe(
      404,
    );
  });
});

describe("a group chat's emoji", () => {
  it("any member adds one; only they or the owner can rename or remove it", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const chat = await makeChat(a, [b, c]);
    const added = await upload(b, { name: "bees", scopeType: "chat", scopeId: chat._id });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const emojiId = added.body.data.emoji._id;
    expect((await list(c)).map((e) => e.name)).toEqual(["bees"]);
    expect((await request(t.app).patch(`/api/emoji/${emojiId}`).set(as(c)).send({ name: "wasps" })).status).toBe(403);
    expect(
      (await request(t.app).patch(`/api/emoji/${emojiId}`).set(as(b)).send({ name: "wasps" })).body.data.emoji.name,
    ).toBe("wasps");
    expect((await request(t.app).delete(`/api/emoji/${emojiId}`).set(as(c))).status).toBe(403);
    expect((await request(t.app).delete(`/api/emoji/${emojiId}`).set(as(a))).status).toBe(200);
    expect(await list(a)).toEqual([]);
    expect(stored.size).toBe(0);
  });

  it("a channel is not a chat you can add chat emoji to, and a non-member gets a 404", async () => {
    const [a, outsider] = [await createUser(), await createUser()];
    const community = await makeCommunity(a);
    const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;
    expect((await upload(a, { name: "chan", scopeType: "chat", scopeId: general._id })).status).toBe(404);
    const chat = await makeChat(a, [await createUser()]);
    expect((await upload(outsider, { name: "x1", scopeType: "chat", scopeId: chat._id })).status).toBe(404);
  });
});

describe("cleaning up", () => {
  it("deleting a community deletes its emoji and their pictures", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    await upload(a, { name: "gone", scopeType: "community", scopeId: community._id });
    expect(stored.size).toBe(1);
    expect((await request(t.app).delete(`/api/communities/${community._id}`).set(as(a))).status).toBe(200);
    expect(stored.size).toBe(0);
    const { CustomEmojiModel } = await import("../models/customEmoji.js");
    expect(await CustomEmojiModel.countDocuments({ communityId: community._id })).toBe(0);
  });

  it("deleting a chat deletes its emoji and their pictures", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await makeChat(a, [b]);
    await upload(a, { name: "chatty", scopeType: "chat", scopeId: chat._id });
    expect(stored.size).toBe(1);
    const { deleteChat } = await import("../chat/service.js");
    await deleteChat(chat._id);
    expect(stored.size).toBe(0);
    expect(await list(a)).toEqual([]);
  });
});

describe("what is refused", () => {
  it("bad names, a missing picture, the wrong type, a duplicate, and a file that isn't a picture", async () => {
    const [a] = [await createUser()];
    const community = await makeCommunity(a);
    const scope = { scopeType: "community", scopeId: community._id };
    expect((await upload(a, { ...scope, name: "a" })).status).toBe(400);
    expect((await upload(a, { ...scope, name: "has space" })).status).toBe(400);
    expect((await upload(a, { ...scope, name: "x".repeat(33) })).status).toBe(400);
    expect((await upload(a, { ...scope, name: "nofile" }, null)).status).toBe(400);
    const wrongType = await upload(a, { ...scope, name: "wrongtype" }, { buf: PNG, name: "e.jpg", type: "image/jpeg" });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.message).toMatch(/PNG, GIF or WebP/);
    const notAPicture = await upload(
      a,
      { ...scope, name: "fake" },
      { buf: Buffer.from("not an image"), name: "e.png", type: "image/png" },
    );
    expect(notAPicture.status).toBe(400);
    expect((await upload(a, { ...scope, name: "dupe" })).status).toBe(200);
    const again = await upload(a, { ...scope, name: "dupe" });
    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/already an emoji/);
    expect(stored.size).toBe(1);
  });

  it("a picture that is too big is a 400 with a sentence", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    const big = Buffer.concat([PNG, Buffer.alloc(600 * 1024)]);
    const res = await upload(
      a,
      { name: "huge", scopeType: "community", scopeId: community._id },
      { buf: big, name: "e.png", type: "image/png" },
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too big/);
  });

  it("limits how many a community can have", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    const { CustomEmojiModel } = await import("../models/customEmoji.js");
    await CustomEmojiModel.insertMany(
      Array.from({ length: CUSTOM_EMOJI_MAX_PER_SCOPE }, (_, i) => ({
        communityId: community._id,
        name: `e${i}`,
        url: "u",
        storagePath: `p${i}`,
        createdBy: id(a),
      })),
    );
    expect((await upload(a, { name: "onemore", scopeType: "community", scopeId: community._id })).status).toBe(400);
  });
});

describe("using custom emoji in messages", () => {
  const send = (who: U, chatId: string, body: string) =>
    request(t.app).post(`/api/chat/conversations/${chatId}/messages`).set(as(who)).send({ body });
  const react = (who: U, chatId: string, seq: number, key: string) =>
    request(t.app)
      .put(`/api/chat/conversations/${chatId}/messages/${seq}/reactions/${encodeURIComponent(key)}`)
      .set(as(who));

  it("a community's emoji can be a reaction there, and the preview says :name: instead of the token", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await makeCommunity(a);
    await addToCommunity(community._id, b);
    const emoji = (await upload(a, { name: "wave_blob", scopeType: "community", scopeId: community._id })).body.data
      .emoji;
    const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;

    const sent = await send(b, general._id, `hi <:wave_blob:${emoji._id}>`);
    expect(sent.status).toBe(200);
    const channels = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;
    expect(channels[0].lastMessage.preview).toBe("hi :wave_blob:");

    const reacted = await react(a, general._id, sent.body.data.message.seq, `c:${emoji._id}`);
    expect(reacted.status, JSON.stringify(reacted.body)).toBe(200);
    expect(reacted.body.data.message.reactions).toEqual([{ emoji: `c:${emoji._id}`, userIds: [id(a)] }]);
    // Taking your own reaction back works the same way.
    const removed = await request(t.app)
      .delete(
        `/api/chat/conversations/${general._id}/messages/${sent.body.data.message.seq}/reactions/${encodeURIComponent(`c:${emoji._id}`)}`,
      )
      .set(as(a));
    expect(removed.body.data.message.reactions).toEqual([]);
  });

  it("another community's emoji, a group chat's emoji in a channel, and a removed emoji are all refused", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const mine = await makeCommunity(a);
    const other = await makeCommunity(b);
    const theirs = (await upload(b, { name: "theirs", scopeType: "community", scopeId: other._id })).body.data.emoji;
    const chat = await makeChat(a, [b]);
    const chatEmoji = (await upload(a, { name: "chatonly", scopeType: "chat", scopeId: chat._id })).body.data.emoji;
    const [general] = (await request(t.app).get(`/api/communities/${mine._id}/channels`).set(as(a))).body.data.channels;
    const msg = (await send(a, general._id, "hello")).body.data.message;

    expect((await react(a, general._id, msg.seq, `c:${theirs._id}`)).status).toBe(400);
    expect((await react(a, general._id, msg.seq, `c:${chatEmoji._id}`)).status).toBe(400);
    // In the chat it belongs to, it works; and it stops working once removed.
    const chatMsg = (await send(a, chat._id, "hi")).body.data.message;
    expect((await react(a, chat._id, chatMsg.seq, `c:${chatEmoji._id}`)).status).toBe(200);
    await request(t.app).delete(`/api/emoji/${chatEmoji._id}`).set(as(a));
    expect((await react(b, chat._id, chatMsg.seq, `c:${chatEmoji._id}`)).status).toBe(400);
  });

  it("a made-up custom key or a bad shape is a 400", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;
    const msg = (await send(a, general._id, "hello")).body.data.message;
    expect((await react(a, general._id, msg.seq, "c:000000000000000000000000")).status).toBe(400);
    expect((await react(a, general._id, msg.seq, "c:nope")).status).toBe(400);
    expect((await react(a, general._id, msg.seq, "x".repeat(20))).status).toBe(400);
  });
});

describe("when storage fails", () => {
  it("says so plainly, keeps the details out of the answer, and stores nothing", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    const gcs = await import("../utils/gcsUtils.js");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(gcs.uploadToGCS).mockRejectedValueOnce(new Error("secret path /srv/credentials.json"));
    const res = await upload(a, { name: "unlucky", scopeType: "community", scopeId: community._id });
    expect(res.status).toBe(502);
    expect(res.body.message).toBe("Couldn't save the picture. Try again in a moment.");
    expect(JSON.stringify(res.body)).not.toContain("credentials");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
    const { CustomEmojiModel } = await import("../models/customEmoji.js");
    expect(await CustomEmojiModel.countDocuments({ communityId: community._id })).toBe(0);
  });

  it("a name taken in the meantime is a 400 and the picture is removed again", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    const { CustomEmojiModel } = await import("../models/customEmoji.js");
    // The name check passes, then the other upload lands first: the unique index is what catches it.
    const check = vi.spyOn(CustomEmojiModel, "exists").mockResolvedValueOnce(null as never);
    await CustomEmojiModel.create({
      communityId: community._id,
      name: "taken",
      url: "u",
      storagePath: "p",
      createdBy: id(a),
    });
    const res = await upload(a, { name: "taken", scopeType: "community", scopeId: community._id });
    check.mockRestore();
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already an emoji/);
    expect(stored.size).toBe(0);
  });
});

describe("renaming and animation", () => {
  it("renaming keeps names unique within the owner", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    const scope = { scopeType: "community", scopeId: community._id };
    const one = (await upload(a, { ...scope, name: "one" })).body.data.emoji;
    await upload(a, { ...scope, name: "two" });
    expect((await request(t.app).patch(`/api/emoji/${one._id}`).set(as(a)).send({ name: "two" })).status).toBe(400);
    expect(
      (await request(t.app).patch(`/api/emoji/${one._id}`).set(as(a)).send({ name: "Uno" })).body.data.emoji.name,
    ).toBe("uno");
    expect((await request(t.app).patch(`/api/emoji/${one._id}`).set(as(a)).send({ name: "x" })).status).toBe(400);
  });

  it("accepts a GIF", async () => {
    const a = await createUser();
    const community = await makeCommunity(a);
    const res = await upload(
      a,
      { name: "spin", scopeType: "community", scopeId: community._id },
      { buf: GIF, name: "e.gif", type: "image/gif" },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect([...stored.values()][0]!.type).toBe("image/gif");
  });
});
