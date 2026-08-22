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

// These helpers were written for the casino but are timezone-generic; XenBudget passes
// its per-book timezone instead. The `timeZone` parameter is trailing and defaults to
// CASINO_TIMEZONE so every existing casino call site keeps its original meaning.

// Turns a wall-clock date/time in `timeZone` into the real UTC instant it represents.
// `wallKey` is "YYYY-MM-DD" (midnight) or a full "YYYY-MM-DDTHH:mm:ss".
export function zonedWallToUtc(wallKey: string, timeZone: string): Date {
    var iso = wallKey.length === 10 ? wallKey + "T00:00:00Z" : wallKey + "Z";
    var guess = new Date(iso);
    return new Date(guess.getTime() - tzOffsetMs(timeZone, guess));
}

// Midnight in `timeZone`, `daysAgo` days before today, as a UTC Date instant.
export function tzMidnightUtc(daysAgo: number, timeZone: string = CASINO_TIMEZONE): Date {
    var target = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return zonedWallToUtc(tzDayKey(target, timeZone), timeZone);
}

// "YYYY-MM-DD" calendar-day key for `date` in `timeZone` - used by daily-stats to seed
// and match against $dateToString({ timezone }) groupings.
export function tzDayKey(date: Date, timeZone: string = CASINO_TIMEZONE): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// "YYYY-MM" calendar-month key for `date` in `timeZone`. XenBudget's monthly tallies seed
// their empty buckets with this and fill them from $dateToString({ format: "%Y-%m",
// timezone }) - both sides MUST use the same timezone or the buckets never match and
// months render empty.
export function tzMonthKey(date: Date, timeZone: string = CASINO_TIMEZONE): string {
    return tzDayKey(date, timeZone).slice(0, 7);
}

// Midnight on the 1st of `date`'s month in `timeZone`, as a UTC instant.
export function tzMonthStartUtc(date: Date, timeZone: string = CASINO_TIMEZONE): Date {
    return zonedWallToUtc(tzMonthKey(date, timeZone) + "-01", timeZone);
}

export function rangeCutoff(range: string): Date | null {
    if (range === "today") {
        return tzMidnightUtc(0);
    } else if (range === "week") {
        return tzMidnightUtc(7);
    }
    return null;
}
