import { CustomEmojiModel } from "../models/customEmoji";
import { deleteFromStorage } from "../utils/storageUtils";

/** Delete every custom emoji of a community or a chat, with its stored picture (when that owner is deleted). */
export async function deleteEmojiOf(key: { communityId: string } | { conversationId: string }): Promise<void> {
  const emoji = await CustomEmojiModel.find(key, "storagePath").lean().exec();
  if (emoji.length === 0) return;
  await Promise.all(emoji.map((e) => deleteFromStorage(e.storagePath).catch(() => undefined)));
  await CustomEmojiModel.deleteMany(key).exec();
}
