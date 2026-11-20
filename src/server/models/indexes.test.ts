import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "../testing/testApp";

// Mongoose builds the indexes a schema declares when the model initialises. These pin the ones
// the list queries depend on, so a refactor of a model can't quietly drop them.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const indexKeys = async (modelName: string) => {
  const Model = mongoose.model(modelName);
  await Model.init();
  return (await Model.collection.indexes()).map((i) => Object.keys(i.key).join(","));
};

describe("model indexes", () => {
  it("XenSplit groups are indexed by member (the my-groups query)", async () => {
    await import("./xenSplit.js");
    expect(await indexKeys("XenSplit")).toContain("members");
  });

  it("activity is indexed for the feed query and expires old events", async () => {
    await import("./activity.js");
    const keys = await indexKeys("Activity");
    expect(keys).toContain("audienceIds,createdAt");
    const ttl = (await mongoose.model("Activity").collection.indexes()).find((i) => i.expireAfterSeconds);
    expect(ttl?.key).toEqual({ createdAt: 1 });
  });

  it("conversations are indexed by member", async () => {
    await import("./conversation.js");
    expect(await indexKeys("Conversation")).toContain("members.user_id,lastMessage.at");
  });

  it("communities are indexed by member (the my-communities query)", async () => {
    await import("./community.js");
    expect(await indexKeys("Community")).toContain("members.user_id");
  });

  it("channels are indexed by community, and read state is one row per person and channel", async () => {
    await import("./conversation.js");
    await import("./channelState.js");
    expect(await indexKeys("Conversation")).toContain("communityId,channel.position");
    expect(await indexKeys("ChannelState")).toContain("userId,conversationId");
    const unique = (await mongoose.model("ChannelState").collection.indexes()).find((i) => i.unique && i.key.userId);
    expect(unique?.key).toEqual({ userId: 1, conversationId: 1 });
  });

  it("community invites are one per person per community, and expire", async () => {
    await import("./communityInvite.js");
    const indexes = await (async () => {
      await mongoose.model("CommunityInvite").init();
      return mongoose.model("CommunityInvite").collection.indexes();
    })();
    expect(indexes.find((i) => i.unique && i.key.communityId)?.key).toEqual({ communityId: 1, userId: 1 });
    expect(indexes.find((i) => i.expireAfterSeconds)?.key).toEqual({ createdAt: 1 });
  });

  it("notebook pages are indexed for the tree, backlinks, tags and search", async () => {
    await import("./xenNotePage.js");
    const keys = await indexKeys("XenNotePage");
    expect(keys).toContain("section_id,parent_id,order");
    expect(keys).toContain("links");
    expect(keys).toContain("notebook_id,tags");
    expect(keys).toContain("notebook_id,unresolved");
    expect(keys).toContain("share.token");
    const text = (await mongoose.model("XenNotePage").collection.indexes()).find((i) => i.name === "page_text");
    expect(text?.weights).toEqual({ title: 10, tags: 5, search_text: 1 });
  });

  it("a notebook has one journal page per day, one journal section and one templates section", async () => {
    const { XenNotePage, XenNoteSection } = await import("./xenNotePage.js");
    await XenNotePage.init();
    await XenNoteSection.init();
    const notebook = new mongoose.Types.ObjectId();
    const section = new mongoose.Types.ObjectId();
    const page = (extra: object) =>
      XenNotePage.create({ notebook_id: notebook, section_id: section, order: "a0", ...extra });

    // Pages without a journal day can repeat; a day can't.
    await page({ title: "one" });
    await page({ title: "two" });
    await page({ journal_date: "2026-11-20" });
    await expect(page({ journal_date: "2026-11-20" })).rejects.toThrow(/duplicate key/);
    await page({ journal_date: "2026-11-21" });

    const sec = (extra: object) => XenNoteSection.create({ notebook_id: notebook, name: "s", order: "a0", ...extra });
    await sec({});
    await sec({});
    await sec({ kind: "journal" });
    await expect(sec({ kind: "journal" })).rejects.toThrow(/duplicate key/);
    await sec({ kind: "templates" });
    await expect(sec({ kind: "templates" })).rejects.toThrow(/duplicate key/);
  });

  it("pages are found by a text search over title, tags and text", async () => {
    const { XenNotePage } = await import("./xenNotePage.js");
    await XenNotePage.init();
    const notebook = new mongoose.Types.ObjectId();
    const section = new mongoose.Types.ObjectId();
    await XenNotePage.create({
      notebook_id: notebook,
      section_id: section,
      order: "a0",
      title: "Quarterly planning",
      search_text: "agenda and the open risks",
    });
    const found = await XenNotePage.find({ notebook_id: notebook, $text: { $search: "risks" } });
    expect(found.map((p) => p.title)).toEqual(["Quarterly planning"]);
  });

  it("a page's body and its versions belong to one page each", async () => {
    const { XenNotePageBody, XenNotePageVersion } = await import("./xenNotePage.js");
    await XenNotePageBody.init();
    const pageId = new mongoose.Types.ObjectId();
    const doc = { type: "doc", content: [{ type: "paragraph", attrs: {} }] };
    await XenNotePageBody.create({ page_id: pageId, doc });
    await expect(XenNotePageBody.create({ page_id: pageId, doc })).rejects.toThrow(/duplicate key/);
    // An empty attrs object is kept, not dropped.
    const stored = await XenNotePageBody.findOne({ page_id: pageId }).lean();
    expect(stored?.doc).toEqual(doc);
    expect(stored?.schema_version).toBe(1);
    await XenNotePageVersion.init();
    expect((await XenNotePageVersion.collection.indexes()).find((i) => i.expireAfterSeconds)?.key).toEqual({
      captured_at: 1,
    });
  });
});
