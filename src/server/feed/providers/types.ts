import type { AttentionCard } from "@shared/feed";

/**
 * Something that can say "this needs you". Computed live for the person asking and never stored. Each sub-app that
 * has something worth interrupting for adds one here (see feed/attention.ts). Return an empty list when all is well.
 */
export interface AttentionProvider {
  key: string;
  fetch(userId: string): Promise<AttentionCard[]>;
}
