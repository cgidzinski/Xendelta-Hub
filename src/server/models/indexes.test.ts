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

  it("spaces are indexed by member (the my-spaces query)", async () => {
    await import("./space.js");
    expect(await indexKeys("Space")).toContain("members.user_id");
  });
});
