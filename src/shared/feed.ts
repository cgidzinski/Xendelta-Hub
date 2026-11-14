// Shapes of the Home feed API, shared by the server routes and the client hooks.
import type { FeedEntry } from "./activity";

export type AttentionSeverity = "critical" | "warning" | "info";

/** One thing waiting on the person. Computed live on every request, never stored. */
export interface AttentionCard {
  /** Stable per card, e.g. "xenroutine:overdue". */
  key: string;
  /** The sub-app key (constants/apps), which is also what the pinned-app badge is counted under. */
  app: string;
  severity: AttentionSeverity;
  title: string;
  subtitle?: string;
  link: string;
  /** How many things the card stands for. Adds up to the app's badge. */
  count: number;
}

export interface AttentionResponse {
  cards: AttentionCard[];
  /** Per sub-app key: how many things are waiting. */
  counts: Record<string, number>;
  /** Per sub-app key: how much the person has in it (recipes, notes...), shown as a quiet count, not an alert. */
  totals?: Record<string, number>;
}

export interface FeedPage {
  entries: FeedEntry[];
  /** Pass back as `cursor` for the next page; null at the end. */
  nextCursor: string | null;
}

export interface FeedPrefs {
  mutedApps: string[];
  /** "<app>:<spaceId>" */
  mutedSpaces: string[];
}
