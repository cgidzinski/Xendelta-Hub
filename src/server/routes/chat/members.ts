import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { canMessage, isChatOwner, nextOwner, roleInChat } from "../../chat/policy";
import { deleteChat, loadChat, loadPeople, memberIdsOf, postSystemMessage, serializeChat } from "../../chat/service";
import { realtime } from "../../realtime";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  addChatMembersSchema,
  chatConversationParamSchema,
  chatMemberParamSchema,
  chatOwnerSchema,
} from "../../utils/validation";
import { CHAT_MAX_MEMBERS, rosterKeyOf } from "@shared/chat";

const names = (people: Map<string, { username: string }>, ids: string[]) =>
  ids.map((id) => people.get(id)?.username ?? "Someone").join(", ");

export function registerMemberRoutes(app: Application) {
  // Add people. Any member may. A two-person chat becomes a group and the new people can read what came before.
  app.post(
    "/api/chat/conversations/:conversationId/members",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validate(addChatMembersSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const chat = await loadChat(req.params.conversationId as string, me);
      const wanted = [...new Set(addChatMembersSchema.parse(req.body).userIds)];
      const fresh = wanted.filter((id) => roleInChat(chat, id) === null);
      if (fresh.length === 0) throw new AppError(400, "They're already in this chat");
      if (chat.members.length + fresh.length > CHAT_MAX_MEMBERS) {
        throw new AppError(400, `A chat can have at most ${CHAT_MAX_MEMBERS} people`);
      }

      const people = await loadPeople([me, ...chat.members.map((m) => m.user_id), ...fresh]);
      for (const id of fresh) {
        const person = people.get(id);
        if (!person) throw new AppError(404, "Someone you picked doesn't exist");
        if (!canMessage(me, id)) throw new AppError(403, `You can't add ${person.username}`);
      }

      for (const user_id of fresh) chat.members.push({ user_id, role: "member", joinedAt: new Date(), lastReadSeq: 0 });
      chat.set("rosterKey", rosterKeyOf(memberIdsOf(chat)));
      await chat.save();

      await postSystemMessage(chat, me, "added", `${people.get(me)!.username} added ${names(people, fresh)}`, {
        userIds: fresh,
      });
      realtime.toUsers(memberIdsOf(chat), "chat:conversation", { conversationId: String(chat._id) });
      res.json({ status: true, message: "", data: { conversation: serializeChat(chat, me, people) } });
    },
  );

  // Remove someone (the owner), or leave (anyone, with their own id). If the owner leaves, the member who has been
  // there longest becomes the owner. When the last person leaves the conversation is deleted.
  app.delete(
    "/api/chat/conversations/:conversationId/members/:userId",
    authenticateToken,
    validateParams(chatMemberParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const target = req.params.userId as string;
      const chat = await loadChat(req.params.conversationId as string, me);
      if (roleInChat(chat, target) === null) throw new AppError(404, "They're not in this chat");
      if (target !== me && !isChatOwner(chat, me)) throw new AppError(403, "Only the owner can remove people");

      const remaining = chat.members.filter((m) => m.user_id !== target);
      if (remaining.length === 0) {
        await deleteChat(chat._id);
        realtime.toUsers([target], "chat:conversation", { conversationId: String(chat._id), removed: true });
        return res.json({ status: true, message: "", data: { left: true } });
      }

      const handOverTo = isChatOwner(chat, target) ? nextOwner(chat, target) : null;
      const people = await loadPeople([me, target, ...(handOverTo ? [handOverTo] : [])]);

      chat.set("members", remaining);
      if (handOverTo) {
        const heir = chat.members.find((m) => m.user_id === handOverTo)!;
        heir.role = "owner";
      }
      chat.set("rosterKey", rosterKeyOf(memberIdsOf(chat)));
      await chat.save();

      const left = target === me;
      const who = people.get(me)?.username ?? "Someone";
      await postSystemMessage(
        chat,
        me,
        left ? "left" : "removed",
        left ? `${who} left` : `${who} removed ${people.get(target)?.username ?? "someone"}`,
        { userIds: left ? [] : [target] },
      );
      if (handOverTo) {
        await postSystemMessage(
          chat,
          handOverTo,
          "owner",
          `${people.get(handOverTo)?.username ?? "Someone"} is now the owner`,
        );
      }
      realtime.toUsers(memberIdsOf(chat), "chat:conversation", { conversationId: String(chat._id) });
      realtime.toUsers([target], "chat:conversation", { conversationId: String(chat._id), removed: true });
      res.json({ status: true, message: "", data: { left } });
    },
  );

  // Hand the chat over: the owner makes someone else the owner and becomes a member.
  app.patch(
    "/api/chat/conversations/:conversationId/members/:userId",
    authenticateToken,
    validateParams(chatMemberParamSchema),
    validate(chatOwnerSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const target = req.params.userId as string;
      const chat = await loadChat(req.params.conversationId as string, me);
      if (!isChatOwner(chat, me)) throw new AppError(403, "Only the owner can hand the chat over");
      if (target === me) throw new AppError(400, "You already own this chat");
      if (roleInChat(chat, target) === null) throw new AppError(404, "They're not in this chat");

      for (const m of chat.members) m.role = m.user_id === target ? "owner" : "member";
      await chat.save();

      const people = await loadPeople(memberIdsOf(chat));
      await postSystemMessage(
        chat,
        me,
        "owner",
        `${people.get(me)?.username ?? "Someone"} made ${people.get(target)?.username ?? "someone"} the owner`,
        {
          userIds: [target],
        },
      );
      realtime.toUsers(memberIdsOf(chat), "chat:conversation", { conversationId: String(chat._id) });
      res.json({ status: true, message: "", data: { conversation: serializeChat(chat, me, people) } });
    },
  );
}
