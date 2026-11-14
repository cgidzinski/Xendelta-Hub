import type { ChatContext } from "./access";
import { audienceOf } from "./access";
import { canManageChat } from "./policy";
import { extractMentionIds, mentionsEveryone, mentionsHere } from "@shared/mentions";
import { User } from "../models/user";

/** What a message mentions, once it has been checked against who can read the chat and who may ping everyone. */
export interface ResolvedMentions {
  userIds: string[];
  everyone: boolean;
  here: boolean;
}

/**
 * The mentions in a body that count. Only people who can read the chat can be mentioned (so a message can't ping
 * someone who can't see it), never the sender, and `@everyone` / `@here` need the mention everyone permission in a
 * community (in a group chat anyone may).
 */
export function resolveMentions(context: ChatContext, senderId: string, body: string): ResolvedMentions {
  const readers = new Set(audienceOf(context));
  readers.delete(senderId);
  const allowed = context.community ? canManageChat(context.access, senderId, "mentionEveryone") : true;
  return {
    userIds: extractMentionIds(body).filter((id) => readers.has(id)),
    everyone: allowed && mentionsEveryone(body),
    here: allowed && mentionsHere(body),
  };
}

/** The names to write in a one-line preview for the people mentioned in a body. */
export async function mentionNames(body: string): Promise<Map<string, string>> {
  const ids = extractMentionIds(body);
  if (ids.length === 0) return new Map();
  const users = await User.find({ _id: { $in: ids } }, "username")
    .lean()
    .exec();
  return new Map(users.map((u) => [String(u._id), u.username ?? "someone"]));
}
