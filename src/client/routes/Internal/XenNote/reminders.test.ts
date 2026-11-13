import { describe, it, expect } from "vitest";
import { formatReminder, reminderPresets } from "./reminders";

// Local-time dates (no "Z"), so the tests don't depend on the machine's time zone.
const at = (s: string) => new Date(s);

describe("reminderPresets", () => {
  it("offers in 3 hours, tomorrow morning and next Monday, all in the future", () => {
    const now = at("2026-03-04T10:30:00"); // a Wednesday
    const p = reminderPresets(now);
    expect(p.map((x) => x.label)).toEqual(["In 3 hours", "Tomorrow morning", "Next week"]);
    expect(p[0].at).toEqual(at("2026-03-04T13:30:00"));
    expect(p[1].at).toEqual(at("2026-03-05T08:00:00"));
    expect(p[2].at).toEqual(at("2026-03-09T08:00:00")); // Monday
    expect(p.every((x) => x.at > now)).toBe(true);
  });

  it("goes to the following Monday when today is a Monday", () => {
    expect(reminderPresets(at("2026-03-09T09:00:00"))[2].at).toEqual(at("2026-03-16T08:00:00"));
  });

  it("drops 'Next week' on a Sunday, when it would be the same day as tomorrow morning", () => {
    expect(reminderPresets(at("2026-03-08T09:00:00")).map((x) => x.label)).toEqual(["In 3 hours", "Tomorrow morning"]);
  });

  it("rolls 'in 3 hours' over midnight", () => {
    expect(reminderPresets(at("2026-03-04T23:00:00"))[0].at).toEqual(at("2026-03-05T02:00:00"));
  });
});

describe("formatReminder", () => {
  const now = at("2026-03-04T10:00:00");
  it("says today and tomorrow", () => {
    expect(formatReminder("2026-03-04T15:00:00", now)).toBe("Today 3:00 PM");
    expect(formatReminder("2026-03-05T08:00:00", now)).toBe("Tomorrow 8:00 AM");
  });
  it("gives the date after that, with the year only when it isn't this year", () => {
    expect(formatReminder("2026-03-20T08:05:00", now)).toBe("Mar 20, 8:05 AM");
    expect(formatReminder("2027-01-02T20:00:00", now)).toBe("Jan 2, 2027, 8:00 PM");
  });
});
