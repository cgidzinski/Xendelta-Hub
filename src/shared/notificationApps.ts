// The apps whose notifications a person can switch on or off, and the ways each one reaches them. Shared so Settings
// and the server agree on what can be muted. Announcements from the people who run the hub (messages to everyone,
// replies to your feedback) belong to no app and are always delivered.

export const NOTIFICATION_APPS = [
  { key: "xensplit", label: "XenSplit", about: "Expenses, settlements and group changes" },
  { key: "xenbudget", label: "XenBudget", about: "Being added to a budget book" },
  { key: "xenroutine", label: "XenRoutine", about: "Reminders and activity on routines" },
  { key: "xennote", label: "XenNote", about: "Note reminders and shared notebooks" },
  { key: "xenkitchen", label: "XenKitchen", about: "Recipe books shared with you" },
  { key: "communities", label: "Communities", about: "Invites to communities" },
  { key: "billing", label: "Billing and gems", about: "Statements, allowance warnings and gems you are given" },
] as const;

export type NotificationApp = (typeof NOTIFICATION_APPS)[number]["key"];

/** The ways a notification reaches someone. "inapp" is the bell and the live pop-up; the other two leave the app. */
export const NOTIFICATION_WAYS = [
  { key: "inapp", label: "In the app" },
  { key: "push", label: "Push" },
  { key: "email", label: "Email" },
] as const;

export type NotificationWay = (typeof NOTIFICATION_WAYS)[number]["key"];

/** One switched-off combination, stored as "xensplit:email". */
export type MutedNotification = `${NotificationApp}:${NotificationWay}`;

export const isMutedNotification = (v: unknown): v is MutedNotification => {
  if (typeof v !== "string") return false;
  const [app, way, ...rest] = v.split(":");
  return (
    rest.length === 0 && NOTIFICATION_APPS.some((a) => a.key === app) && NOTIFICATION_WAYS.some((w) => w.key === way)
  );
};

/** The apps and ways that are switched on, given the switched-off list. */
export const isNotificationOn = (muted: readonly string[], app: NotificationApp, way: NotificationWay): boolean =>
  !muted.includes(`${app}:${way}`);
