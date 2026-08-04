const { CASINO_TIMEZONE } = require("../models/xenCasino");

// Shared "today / this week / all time" cutoff used by every XenCasino stats-style
// aggregation (admin stats, admin player-stats, admin daily-stats, the player-facing
// leaderboard) so the today/week boundary definition can't drift between them. Anchored to
// CASINO_TIMEZONE (not UTC) so it agrees with every other "today" concept in the casino
// system - daily quests (xenCasino.js) and ranch decay (xenCasinoRanch.js) are both
// CASINO_TIMEZONE-anchored too.
export type StatsRange = "today" | "week" | "all";

// Offset (ms) between UTC and `timeZone` at the instant `date` represents - i.e. how much
// to subtract from a UTC timestamp with `date`'s wall-clock components to get the real UTC
// instant for that wall-clock time in `timeZone`.
function tzOffsetMs(timeZone: string, date: Date): number {
    var dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    var parts: Record<string, string> = {};
    dtf.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    var hour = parts.hour === "24" ? "00" : parts.hour;
    var asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
    return asUTC - date.getTime();
}

// Midnight in CASINO_TIMEZONE, `daysAgo` days before today, as a UTC Date instant.
export function tzMidnightUtc(daysAgo: number): Date {
    var target = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    var dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: CASINO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(target);
    var guess = new Date(dayKey + "T00:00:00Z");
    return new Date(guess.getTime() - tzOffsetMs(CASINO_TIMEZONE, guess));
}

// "YYYY-MM-DD" calendar-day key for `date` in CASINO_TIMEZONE - used by daily-stats to seed
// and match against $dateToString({ timezone: CASINO_TIMEZONE }) groupings.
export function tzDayKey(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CASINO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function rangeCutoff(range: string): Date | null {
    if (range === "today") {
        return tzMidnightUtc(0);
    } else if (range === "week") {
        return tzMidnightUtc(7);
    }
    return null;
}
