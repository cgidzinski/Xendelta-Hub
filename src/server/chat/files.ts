// Files stored in a community's channels are the community's cost (payer = community, docs/billing.md), so they go when the
// last thing using them goes: the last message that shows one, or the channel, or the community. A DM's or group chat's
// attachments stay in the sender's storage viewer after the message goes, as before.

import { FileRecord } from "../models/fileRecord";
import { Message } from "../models/message";
import { removeAppFiles } from "../utils/appFiles";

/** After a message dropped these attachments: delete each community-paid file no other message still shows. */
export async function removeUnusedChannelFiles(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const records = await FileRecord.find({ _id: { $in: fileIds }, "payer.type": "community" }, "_id").lean();
  const gone: string[] = [];
  for (const r of records) {
    const stillShown = await Message.exists({ "attachments.fileId": r._id, deletedAt: { $exists: false } });
    if (!stillShown) gone.push(String(r._id));
  }
  await removeAppFiles(gone);
}

/** Delete every file stored in these channels (when the channel or its community is deleted). */
export async function removeChannelFiles(channelIds: unknown[]): Promise<void> {
  if (channelIds.length === 0) return;
  const records = await FileRecord.find(
    { bucket: "private", "space.app": "chat", "space.ref": { $in: channelIds.map(String) }, "payer.type": "community" },
    "_id",
  ).lean();
  await removeAppFiles(records.map((r) => r._id));
}
