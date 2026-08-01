import { describe, it, expect } from "vitest";
const { dailyQuestsStatus, dailyQuestDateKey, DAILY_QUEST_DEFINITIONS } = require("./xenCasino");

// Pure logic only — no Mongo connection involved. Exercises the lazy-reset-on-date-change
// behavior and the three independent quests (unique-games, rounds-10, rounds-20).
describe("dailyQuestsStatus", () => {
  const today = dailyQuestDateKey();

  it("returns all three quests from DAILY_QUEST_DEFINITIONS", () => {
    const status = dailyQuestsStatus({ dailyQuests: [], gamesPlayedToday: [] });
    expect(status).toHaveLength(DAILY_QUEST_DEFINITIONS.length);
    expect(status.map((q: any) => q.key)).toEqual(["unique-games", "rounds-10", "rounds-20"]);
  });

  it("all quests start at 0 progress, not claimable", () => {
    const status = dailyQuestsStatus({ dailyQuests: [], gamesPlayedToday: [] });
    for (const q of status) {
      expect(q.progress).toBe(0);
      expect(q.claimed).toBe(false);
      expect(q.canClaim).toBe(false);
    }
  });

  it("unique-games quest reflects gamesPlayedToday count", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "unique-games", date: today, progress: 0, claimed: false }],
      gamesPlayedToday: ["slots", "plinko", "memory"],
    });
    const uniqueQuest = status.find((q: any) => q.key === "unique-games");
    expect(uniqueQuest).toBeDefined();
    expect(uniqueQuest.progress).toBe(3);
  });

  it("rounds quests reflect their own progress field", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [
        { key: "unique-games", date: today, progress: 0, claimed: false },
        { key: "rounds-10", date: today, progress: 7, claimed: false },
        { key: "rounds-20", date: today, progress: 7, claimed: false },
      ],
      gamesPlayedToday: ["slots"],
    });
    const r10 = status.find((q: any) => q.key === "rounds-10");
    const r20 = status.find((q: any) => q.key === "rounds-20");
    expect(r10.progress).toBe(7);
    expect(r20.progress).toBe(7);
  });

  it("quest becomes claimable when progress reaches target", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-10", date: today, progress: 10, claimed: false }],
      gamesPlayedToday: [],
    });
    const r10 = status.find((q: any) => q.key === "rounds-10");
    expect(r10.canClaim).toBe(true);
  });

  it("quest is not claimable once claimed (even past target)", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-10", date: today, progress: 15, claimed: true }],
      gamesPlayedToday: [],
    });
    const r10 = status.find((q: any) => q.key === "rounds-10");
    expect(r10.canClaim).toBe(false);
    expect(r10.claimed).toBe(true);
  });

  it("lazy-resets round quests from a stale date; unique-games reflects gamesPlayedToday array", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [
        { key: "unique-games", date: "2000-01-01", progress: 0, claimed: true },
        { key: "rounds-10", date: "2000-01-01", progress: 10, claimed: true },
        { key: "rounds-20", date: "2000-01-01", progress: 20, claimed: true },
      ],
      gamesPlayedToday: ["slots", "plinko", "memory", "garden", "printer"],
    });
    // Rounds quests reset because their date is stale.
    const r10 = status.find((q: any) => q.key === "rounds-10");
    const r20 = status.find((q: any) => q.key === "rounds-20");
    expect(r10.progress).toBe(0);
    expect(r10.claimed).toBe(false);
    expect(r10.canClaim).toBe(false);
    expect(r20.progress).toBe(0);
    expect(r20.claimed).toBe(false);
    // Unique-games progress comes from gamesPlayedToday array (5 entries),
    // which is independent of the quest entry's date freshness.
    const uniqueQuest = status.find((q: any) => q.key === "unique-games");
    expect(uniqueQuest.progress).toBe(5);
    expect(uniqueQuest.claimed).toBe(false);
    expect(uniqueQuest.canClaim).toBe(true);
  });

  it("unique-games quest can be claimable independently of rounds quests", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [
        { key: "unique-games", date: today, progress: 0, claimed: false },
        { key: "rounds-10", date: today, progress: 3, claimed: false },
        { key: "rounds-20", date: today, progress: 3, claimed: false },
      ],
      gamesPlayedToday: ["slots", "plinko", "memory", "garden", "printer"],
    });
    const uniqueQuest = status.find((q: any) => q.key === "unique-games");
    const r10 = status.find((q: any) => q.key === "rounds-10");
    expect(uniqueQuest.canClaim).toBe(true);
    expect(r10.canClaim).toBe(false);
  });
});

