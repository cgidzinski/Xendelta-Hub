// What happens around a call: ringing, telling the chat, and the line left in the history afterwards.
import { audienceOf, resolveChatAccess, type ChatContext } from "../chat/access";
import { postSystemMessage } from "../chat/service";
import { realtime } from "../realtime";
import { sendPushToUser } from "../utils/pushUtils";
import { User } from "../models/user";
import { callRegistry } from "./registry";
import { CALL_RING_SECONDS } from "@shared/calls";

/** A channel of a community is a voice channel: people drop in and out, nobody is rung, and no line is left behind. */
export const isVoiceChannel = (context: ChatContext) => !!context.community;

/** Everyone in the chat hears the call changed (so "Join call" and the participant list stay right). */
export function announceCall(context: ChatContext) {
  realtime.toUsers(audienceOf(context), "call:state", {
    conversationId: String(context.chat._id),
    call: callRegistry.state(String(context.chat._id)),
  });
}

const ring = (
  ids: string[],
  conversationId: string,
  fromUserId: string,
  fromName: string,
  video: boolean,
  ringing: boolean,
) => realtime.toUsers(ids, "call:ring", { conversationId, fromUserId, fromName, video, ringing });

/** "12 min", "45 sec". */
export function durationText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Ring everyone else in a DM or group chat: a live notice, and a push for those not looking. */
export async function ringOthers(context: ChatContext, starterId: string, starterName: string, video: boolean) {
  const conversationId = String(context.chat._id);
  const others = audienceOf(context).filter((id) => id !== starterId);
  ring(others, conversationId, starterId, starterName, video, true);
  for (const userId of others) {
    if (realtime.isOnline(userId)) continue;
    void sendPushToUser(userId, {
      title: `${starterName} is calling`,
      body: video ? "Video call" : "Voice call",
      url: `/internal/messages/${conversationId}`,
      tag: `call-${conversationId}`,
    }).catch(() => undefined);
  }
  // Nobody picks up: it ends as a missed call.
  callRegistry.setRingTimer(
    conversationId,
    setTimeout(() => {
      const call = callRegistry.get(conversationId);
      if (call && call.participants.size === 1) void endCall(context, starterId, starterName, video);
    }, CALL_RING_SECONDS * 1000),
  );
}

/** The call is over: stop any ringing, tell the chat, and (in a DM or group chat) leave a line saying how it went. */
export async function endCall(context: ChatContext, userId: string, starterName: string, video: boolean) {
  const conversationId = String(context.chat._id);
  const left = callRegistry.leave(conversationId, userId);
  // endCall is also the ring timeout: the starter is taken out here.
  const call = left.call ?? callRegistry.get(conversationId);
  if (!left.ended || !call) return;
  const others = audienceOf(context).filter((id) => id !== call.startedBy);
  ring(others, conversationId, call.startedBy, starterName, video, false);
  realtime.toUsers(audienceOf(context), "call:state", { conversationId, call: null });
  if (isVoiceChannel(context)) return;
  const answered = call.everJoined.size > 1;
  await postSystemMessage(
    context.chat,
    call.startedBy,
    answered ? "call_ended" : "call_missed",
    answered ? `Call · ${durationText(left.seconds ?? 0)}` : "Missed call",
    answered ? { name: durationText(left.seconds ?? 0) } : {},
    audienceOf(context),
  ).catch(() => undefined);
}

/** Take a person out of a call, announcing it; ends the call if they were the last. */
export async function leaveCall(context: ChatContext, userId: string) {
  const conversationId = String(context.chat._id);
  const call = callRegistry.get(conversationId);
  if (!call) return;
  const starter = await User.findById(call.startedBy, "username").lean().exec();
  await endCall(context, userId, starter?.username ?? "Someone", call.video);
  announceCall(context);
}

/** When a person's last tab closes they drop out of any call (their media is gone anyway). */
export async function leaveAllCalls(userId: string) {
  for (const conversationId of callRegistry.callsOf(userId)) {
    const context = await resolveChatAccess(conversationId, userId);
    if (context) await leaveCall(context, userId);
    else callRegistry.leave(conversationId, userId);
  }
}
