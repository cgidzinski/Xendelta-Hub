import { describe, it, expect } from "vitest";
const { dailyQuestStatus, dailyQuestDateKey, DAILY_QUEST_TARGET } = require("./xenCasino");

// Pure logic only - no Mongo connection involved. `recordRoundPlayed`/`getDailyQuestStatus`
// (the actual Mongoose statics) are thin persistence wrappers around this same function,
// so exercising it directly covers the lazy-reset-on-date-change behavior they rely on.
describe("dailyQuestStatus", () => {
  const today = dailyQuestDateKey();

  it("is not claimable with no progress yet", () => {
    const status = dailyQuestStatus({ dailyQuest: null });
    expect(status).toEqual({ target: DAILY_QUEST_TARGET, roundsPlayed: 0, claimed: false, canClaim: false });
  });

  it("is not claimable below target", () => {
    const status = dailyQuestStatus({ dailyQuest: { date: today, roundsPlayed: DAILY_QUEST_TARGET - 1, claimed: false } });
    expect(status.canClaim).toBe(false);
  });

  it("is claimable once the target is reached", () => {
    const status = dailyQuestStatus({ dailyQuest: { date: today, roundsPlayed: DAILY_QUEST_TARGET, claimed: false } });
    expect(status.canClaim).toBe(true);
  });

  it("is claimable past the target too (never over-caps roundsPlayed)", () => {
    const status = dailyQuestStatus({ dailyQuest: { date: today, roundsPlayed: DAILY_QUEST_TARGET + 5, claimed: false } });
    expect(status.roundsPlayed).toBe(DAILY_QUEST_TARGET + 5);
    expect(status.canClaim).toBe(true);
  });

  it("is not claimable once already claimed", () => {
    const status = dailyQuestStatus({ dailyQuest: { date: today, roundsPlayed: DAILY_QUEST_TARGET, claimed: true } });
    expect(status.canClaim).toBe(false);
    expect(status.claimed).toBe(true);
  });

  it("lazily resets progress from a stale (non-today) date, regardless of how much was played", () => {
    const status = dailyQuestStatus({ dailyQuest: { date: "2000-01-01", roundsPlayed: DAILY_QUEST_TARGET + 10, claimed: true } });
    expect(status).toEqual({ target: DAILY_QUEST_TARGET, roundsPlayed: 0, claimed: false, canClaim: false });
  });
});
