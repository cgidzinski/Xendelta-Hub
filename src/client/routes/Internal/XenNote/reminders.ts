import {
  addDays,
  addHours,
  format,
  isSameDay,
  nextMonday,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
} from "date-fns";

// The quick choices for a note reminder, and how a reminder's time reads. Pure, so the tests cover them.

const atMorning = (d: Date) => setMilliseconds(setSeconds(setMinutes(setHours(d, 8), 0), 0), 0);

export interface ReminderPreset {
  label: string;
  at: Date;
}

/** "In 3 hours", "Tomorrow morning", "Next week": times that are always in the future. */
export function reminderPresets(now: Date = new Date()): ReminderPreset[] {
  const tomorrow = atMorning(addDays(now, 1));
  // nextMonday is the Monday after today even when today is a Monday, so it's always at least a day away.
  const week = atMorning(nextMonday(now));
  const presets: ReminderPreset[] = [{ label: "In 3 hours", at: addHours(now, 3) }];
  presets.push({ label: "Tomorrow morning", at: tomorrow });
  // Skip "Next week" when it would land on the same day as "Tomorrow morning" (today is a Sunday).
  if (!isSameDay(week, tomorrow)) presets.push({ label: "Next week", at: week });
  return presets;
}

/** "Today 3:00 PM", "Tomorrow 8:00 AM", "Mar 4, 8:00 AM" (with the year once it isn't this year). */
export function formatReminder(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  const time = format(when, "h:mm a");
  if (isSameDay(when, now)) return `Today ${time}`;
  if (isSameDay(when, addDays(now, 1))) return `Tomorrow ${time}`;
  return when.getFullYear() === now.getFullYear() ? format(when, "MMM d, h:mm a") : format(when, "MMM d, yyyy, h:mm a");
}
