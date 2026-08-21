// A curated list rather than the full IANA set from Intl.supportedValuesOf: several
// hundred entries makes the picker unusable, and these cover the cases that come up.
// Any value already stored on a user is appended by the picker so it never disappears.
export const COMMON_TIMEZONES = [
    "America/Toronto", "America/Vancouver", "America/New_York", "America/Chicago",
    "America/Denver", "America/Los_Angeles", "America/Halifax", "America/Sao_Paulo",
    "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
    "Europe/Warsaw", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
    "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland", "UTC",
];

/** What the browser thinks it is. Falls back to UTC on the rare runtime that won't say. */
export function browserTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}
