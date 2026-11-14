import type { Application, Request, Response } from "express";
import { Message } from "../../models/message";
import { authenticateToken } from "../../middleware/auth";
import { resolveChatAccess } from "../../chat/access";
import { canPostChat } from "../../chat/policy";
import { appendMessage, loadChatContext, publishMessage } from "../../chat/service";
import { AppError, callerId, loadCaller } from "../../utils/http";
import { validate, validateParams, chatMessageParamSchema, forwardMessageSchema } from "../../utils/validation";

// Forward a message: a copy goes to other chats the caller can post in, marked with who first said it. The source chat is
// never named in the copy, and a chat the caller can't post in is skipped (and reported) rather than failing the rest.
export function registerForwardRoutes(app: Application) {
  app.post(
    "/api/chat/conversations/:conversationId/messages/:seq/forward",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    validate(forwardMessageSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const source = await loadChatContext(req.params.conversationId as string, me);
      const original = await Message.findOne({ conversationId: source.chat._id, seq: Number(req.params.seq) }).exec();
      if (!original || original.kind !== "text" || original.deletedAt || typeof original.threadRoot === "number") {
        throw new AppError(400, "You can't forward that message");
      }
      const { toConversationIds } = forwardMessageSchema.parse(req.body);
      const senderName = (await loadCaller(req)).username ?? "Someone";

      const sent: string[] = [];
      const skipped: string[] = [];
      for (const target of toConversationIds) {
        const context = await resolveChatAccess(target, me);
        if (!context || !canPostChat(context.access, me)) {
          skipped.push(target);
          continue;
        }
        const copy = await appendMessage(context.chat, {
          from: me,
          body: original.body ?? "",
          attachments: original.attachments.map((a) => ({
            fileId: String(a.fileId),
            name: a.name,
            mimeType: a.mimeType,
            size: a.size ?? 0,
          })),
          gif: original.gif?.url
            ? {
                url: original.gif.url,
                stillUrl: original.gif.stillUrl ?? original.gif.url,
                width: original.gif.width ?? 1,
                height: original.gif.height ?? 1,
                title: original.gif.title ?? "",
              }
            : undefined,
          voice: original.voice?.duration
            ? { duration: original.voice.duration, waveform: [...(original.voice.waveform ?? [])] }
            : undefined,
          // A forward of a forward still names whoever said it first.
          forwardedFrom: original.forwardedFrom ?? original.from ?? undefined,
        });
        await publishMessage(context, copy, senderName);
        sent.push(target);
      }
      res.json({ status: true, message: "", data: { sent, skipped } });
    },
  );
}
