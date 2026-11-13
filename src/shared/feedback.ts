// Feedback people send (routes/feedback.ts) and the admin's inbox for it (routes/admin/feedback.ts).

export const FEEDBACK_STATUSES = ["new", "seen", "done", "archived"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  seen: "Seen",
  done: "Done",
  archived: "Archived",
};

export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_MIN_LENGTH = 3;

/** How many a person can send per hour (a stuck button or a bot can't fill the inbox). */
export const FEEDBACK_PER_HOUR = 10;

/** Quick-pick gem amounts for thanking someone for a bug report (Admin → Feedback → Resolve). */
export const FEEDBACK_REWARD_PRESETS = [10, 25, 50, 100, 250] as const;
export const FEEDBACK_REWARD_DEFAULT_GEMS = 50;
export const FEEDBACK_REWARD_MAX_GEMS = 10_000;
export const FEEDBACK_REWARD_MESSAGE_MAX_LENGTH = 500;
/** Quick-pick thank-you messages; the admin can edit the text before sending. */
export const FEEDBACK_REWARD_MESSAGES = [
  "Thanks for the bug report. It's fixed, and here are some gems as a thank you!",
  "Great catch, thank you! Here are some gems for finding it.",
  "Thanks for helping us improve. Enjoy the gems!",
] as const;

/** Quick-pick replies when resolving without gems. */
export const FEEDBACK_RESOLVE_MESSAGES = [
  "Thanks for the report. This is fixed now.",
  "Thanks for letting us know. We're looking into it.",
  "Thanks for the idea. We've noted it.",
] as const;

export interface AdminFeedback {
  _id: string;
  createdAt: string;
  message: string;
  status: FeedbackStatus;
  from: { _id: string; username: string };
  /** Gems given as a thank-you for this feedback. Absent until it has been rewarded (once only). */
  rewardedGems?: number;
  rewardedAt?: string;
}
