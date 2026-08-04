import { describe, it, expect } from "vitest";
const { dailyQuestsStatus, dailyQuestDateKey, DAILY_QUEST_DEFINITIONS } = require("./xenCasino");

// Pure logic only — no Mongo connection involved. Exercises the lazy-reset-on-date-change
// behavior and the three independent quests (rounds-5, rounds-10, rounds-20), including
// the distinct-games gate on claiming rounds-10/rounds-20.
describe("dailyQuestsStatus", () => {
  const today = dailyQuestDateKey();

  it("returns all three quests from DAILY_QUEST_DEFINITIONS", () => {
    const status = dailyQuestsStatus({ dailyQuests: [], gamesPlayedToday: [], gamesPlayedTodayDate: null });
    expect(status).toHaveLength(DAILY_QUEST_DEFINITIONS.length);
    expect(status.map((q: any) => q.key)).toEqual(["rounds-5", "rounds-10", "rounds-20"]);
  });

  it("all quests start at 0 progress, not claimable", () => {
    const status = dailyQuestsStatus({ dailyQuests: [], gamesPlayedToday: [], gamesPlayedTodayDate: null });
    for (const q of status) {
      expect(q.progress).toBe(0);
      expect(q.claimed).toBe(false);
      expect(q.canClaim).toBe(false);
    }
  });

  it("rounds quests reflect their own progress field", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [
        { key: "rounds-5", date: today, progress: 5, claimed: false },
        { key: "rounds-10", date: today, progress: 7, claimed: false },
        { key: "rounds-20", date: today, progress: 7, claimed: false },
      ],
      gamesPlayedToday: [],
      gamesPlayedTodayDate: today,
    });
    const r5 = status.find((q: any) => q.key === "rounds-5");
    const r10 = status.find((q: any) => q.key === "rounds-10");
    const r20 = status.find((q: any) => q.key === "rounds-20");
    expect(r5.progress).toBe(5);
    expect(r10.progress).toBe(7);
    expect(r20.progress).toBe(7);
  });

  it("rounds-5 is claimable at target with no distinct-games requirement", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-5", date: today, progress: 5, claimed: false }],
      gamesPlayedToday: [],
      gamesPlayedTodayDate: today,
    });
    const r5 = status.find((q: any) => q.key === "rounds-5");
    expect(r5.canClaim).toBe(true);
  });

  it("rounds-10 at full progress is NOT claimable with fewer than 3 distinct games", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-10", date: today, progress: 10, claimed: false }],
      gamesPlayedToday: ["slots", "plinko"],
      gamesPlayedTodayDate: today,
    });
    const r10 = status.find((q: any) => q.key === "rounds-10");
    expect(r10.progress).toBe(10);
    expect(r10.canClaim).toBe(false);
  });

  it("rounds-10 at full progress IS claimable with 3 distinct games", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-10", date: today, progress: 10, claimed: false }],
      gamesPlayedToday: ["slots", "plinko", "memory"],
      gamesPlayedTodayDate: today,
    });
    const r10 = status.find((q: any) => q.key === "rounds-10");
    expect(r10.canClaim).toBe(true);
  });

  it("rounds-20 at full progress is NOT claimable with fewer than 5 distinct games", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-20", date: today, progress: 20, claimed: false }],
      gamesPlayedToday: ["slots", "plinko", "memory", "garden"],
      gamesPlayedTodayDate: today,
    });
    const r20 = status.find((q: any) => q.key === "rounds-20");
    expect(r20.canClaim).toBe(false);
  });

  it("rounds-20 at full progress IS claimable with 5 distinct games", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-20", date: today, progress: 20, claimed: false }],
      gamesPlayedToday: ["slots", "plinko", "memory", "garden", "printer"],
      gamesPlayedTodayDate: today,
    });
    const r20 = status.find((q: any) => q.key === "rounds-20");
    expect(r20.canClaim).toBe(true);
  });

  it("quest is not claimable once claimed (even past target)", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-10", date: today, progress: 15, claimed: true }],
      gamesPlayedToday: ["slots", "plinko", "memory"],
      gamesPlayedTodayDate: today,
    });
    const r10 = status.find((q: any) => q.key === "rounds-10");
    expect(r10.canClaim).toBe(false);
    expect(r10.claimed).toBe(true);
  });

  it("lazy-resets round quests from a stale date", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [
        { key: "rounds-5", date: "2000-01-01", progress: 5, claimed: true },
        { key: "rounds-10", date: "2000-01-01", progress: 10, claimed: true },
        { key: "rounds-20", date: "2000-01-01", progress: 20, claimed: true },
      ],
      gamesPlayedToday: ["slots", "plinko", "memory", "garden", "printer"],
      gamesPlayedTodayDate: today,
    });
    // Rounds quests reset because their date is stale.
    for (const key of ["rounds-5", "rounds-10", "rounds-20"]) {
      const q = status.find((s: any) => s.key === key);
      expect(q.progress).toBe(0);
      expect(q.claimed).toBe(false);
      expect(q.canClaim).toBe(false);
    }
  });

  it("treats gamesPlayedToday as empty when gamesPlayedTodayDate is stale", () => {
    const status = dailyQuestsStatus({
      dailyQuests: [{ key: "rounds-20", date: today, progress: 20, claimed: false }],
      // Populated, but from a previous day - must not count toward today's gate.
      gamesPlayedToday: ["slots", "plinko", "memory", "garden", "printer"],
      gamesPlayedTodayDate: "2000-01-01",
    });
    const r20 = status.find((q: any) => q.key === "rounds-20");
    expect(r20.canClaim).toBe(false);
  });
});
