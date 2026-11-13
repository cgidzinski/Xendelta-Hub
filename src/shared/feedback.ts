// Feedback people send (routes/feedback.ts) and the admin's inbox for it (routes/admin/feedback.ts).

export const FEEDBACK_STATUSES = ["new", "seen", "done", "dismissed", "archived"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  seen: "Seen",
  // "done" is stored as before; people see it as Resolved.
  done: "Resolved",
  dismissed: "Dismissed",
  archived: "Archived",
};

export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_MIN_LENGTH = 3;

/** How many a person can send per hour (a stuck button or a bot can't fill the inbox). */
export const FEEDBACK_PER_HOUR = 10;

/** How an admin closes a report: Resolved (fixed or answered) or Dismissed (reviewed, no action). */
export const FEEDBACK_OUTCOMES = ["resolved", "dismissed"] as const;
export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];
export const FEEDBACK_OUTCOME_LABEL: Record<FeedbackOutcome, string> = { resolved: "Resolved", dismissed: "Dismissed" };

/** Gem amounts offered when thanking someone for a bug report (Admin → Feedback). */
export const FEEDBACK_REWARD_PRESETS = [100, 250, 500, 1000, 2500, 5000] as const;
export const FEEDBACK_REWARD_MAX_GEMS = 10_000;
export const FEEDBACK_REWARD_MESSAGE_MAX_LENGTH = 500;

export interface FeedbackMessagePreset {
  key: string;
  /** Short name shown in the select. */
  label: string;
  /** The full text, put in the message box where it can be edited before sending. */
  text: string;
  /** Written to go with a gem reward. */
  withGems?: boolean;
}

export const FEEDBACK_MESSAGE_PRESETS: readonly FeedbackMessagePreset[] = [
  {
    key: "g_fixed",
    label: "Fixed, thank you",
    withGems: true,
    text: "Thanks for the bug report. It's fixed, and here are some gems as a thank you!",
  },
  {
    key: "g_catch",
    label: "Great catch",
    withGems: true,
    text: "Great catch, thank you! Here are some gems for finding it.",
  },
  {
    key: "g_tricky",
    label: "Tricky one",
    withGems: true,
    text: "You found a tricky one. It's fixed now, and these gems are for you.",
  },
  {
    key: "g_clear",
    label: "Clear details",
    withGems: true,
    text: "Thanks for the clear details, they made this easy to fix. Here are some gems.",
  },
  { key: "r_fixed", label: "It's fixed", text: "Thanks for the report. This is fixed now." },
  { key: "r_looking", label: "Looking into it", text: "Thanks for letting us know. We're looking into it." },
  {
    key: "r_steps",
    label: "Need the steps",
    text: "Thanks for the report. We couldn't reproduce this. Could you tell us the steps that led to it?",
  },
  {
    key: "r_intended",
    label: "Works as intended",
    text: "Thanks for writing in. This works as intended for now, but we hear you.",
  },
  { key: "r_listed", label: "Already on our list", text: "Thanks! This is already on our list." },
  { key: "r_idea", label: "Idea noted", text: "Thanks for the idea. We've noted it." },
];

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
