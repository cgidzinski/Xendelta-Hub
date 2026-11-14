import { Community } from "../../models/community";
import { unreadSummaryByCommunity } from "../../communities/channels";
import type { AttentionProvider } from "./types";

/**
 * Unread mentions in a person's communities. Ordinary channel traffic stays out of Home (a busy channel would drown
 * it), but being named, or a message to everyone, is worth a card.
 */
export const mentionsProvider: AttentionProvider = {
  key: "mentions",
  async fetch(userId) {
    const withMentions = [...(await unreadSummaryByCommunity(userId))].filter(([, s]) => s.mentions > 0);
    if (withMentions.length === 0) return [];
    const communities = await Community.find({ _id: { $in: withMentions.map(([id]) => id) } }, "name")
      .lean()
      .exec();
    const names = new Map(communities.map((c) => [String(c._id), c.name]));
    return withMentions.map(([id, s]) => ({
      key: `mentions:${id}`,
      app: "messages",
      severity: "info" as const,
      title: `${s.mentions} unread ${s.mentions === 1 ? "mention" : "mentions"} in ${names.get(id) ?? "a community"}`,
      link: `/internal/communities/${id}`,
      count: s.mentions,
    }));
  },
};
