import { Conversation } from "../../models/conversation";
import type { AttentionProvider } from "./types";

/** Conversations with messages the person has not read. Muted conversations stay quiet. */
export const chatProvider: AttentionProvider = {
  key: "messages",
  async fetch(userId) {
    const now = Date.now();
    const conversations = await Conversation.find({ "members.user_id": userId }, "members seq").lean();
    let unread = 0;
    for (const c of conversations) {
      const me = c.members.find((m) => m.user_id === userId);
      if (!me) continue;
      if (me.mutedUntil && me.mutedUntil.getTime() > now) continue;
      if ((c.seq ?? 0) > (me.lastReadSeq ?? 0)) unread += 1;
    }
    if (!unread) return [];
    return [
      {
        key: "messages:unread",
        app: "messages",
        severity: "info",
        title: `${unread} unread ${unread === 1 ? "conversation" : "conversations"}`,
        link: "/internal/messages",
        count: unread,
      },
    ];
  },
};
