import { Message } from "../models/message";
import { realtime } from "../realtime";
import { audienceOf, type ChatContext } from "./access";
import { extractUrls, unfurl } from "./linkPreview";
import { serializeMessage } from "./service";

/**
 * Work out the previews for a message and, if they changed, store them and tell everyone who can read it. It runs
 * after the message is sent (nobody waits for it) and never throws: a failure here is only a missing preview.
 */
export async function refreshEmbeds(context: ChatContext, messageId: unknown): Promise<void> {
  try {
    const message = await Message.findById(messageId).exec();
    if (!message || message.kind !== "text" || message.deletedAt || message.embedsOff) return;
    const urls = extractUrls(message.body ?? "");
    const found = (await Promise.all(urls.map(unfurl))).filter((e): e is NonNullable<typeof e> => !!e);
    const same =
      JSON.stringify(found) ===
      JSON.stringify(
        message.embeds.map((e) => ({ url: e.url, title: e.title, description: e.description, siteName: e.siteName })),
      );
    if (same) return;
    message.set("embeds", found);
    await message.save();
    realtime.toUsers(audienceOf(context), "chat:message_update", {
      conversationId: String(context.chat._id),
      message: await serializeMessage(message),
    });
  } catch (error) {
    console.error("Link preview failed:", error);
  }
}
