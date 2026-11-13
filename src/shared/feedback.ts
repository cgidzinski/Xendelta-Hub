// Feedback people send from the hub (routes/feedback.ts) and the admin's inbox for it (routes/admin/feedback.ts).

export const FEEDBACK_KINDS = ["idea", "bug", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  idea: "An idea",
  bug: "Something's wrong",
  other: "Something else",
};

export const FEEDBACK_STATUSES = ["new", "seen", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = { new: "New", seen: "Seen", done: "Done" };

export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_MIN_LENGTH = 3;

/** How many a person can send per hour (a stuck button or a bot can't fill the inbox). */
export const FEEDBACK_PER_HOUR = 10;

export interface AdminFeedback {
  _id: string;
  createdAt: string;
  kind: FeedbackKind;
  message: string;
  /** The page they were on, when they came from the sidebar link. */
  page?: string;
  status: FeedbackStatus;
  from: { _id: string; username: string };
}
