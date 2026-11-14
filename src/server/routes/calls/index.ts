import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { loadChatContext, loadPeople } from "../../chat/service";
import { canPostChat } from "../../chat/policy";
import { SocketManager } from "../../infrastructure/SocketManager";
import {
  callsEnabled,
  closeTracks,
  createSession,
  iceServers,
  renegotiate,
  sessionTracks,
} from "../../calls/cloudflare";
import { callRegistry } from "../../calls/registry";
import { announceCall, isVoiceChannel, leaveAllCalls, leaveCall, ringOthers } from "../../calls/service";
import { realtime } from "../../realtime";
import { AppError, callerId, loadCaller } from "../../utils/http";
import {
  validate,
  validateParams,
  callCloseTracksSchema,
  callParamSchema,
  callRenegotiateSchema,
  callStateSchema,
  callTracksSchema,
  joinCallSchema,
} from "../../utils/validation";
import { CALL_MAX_PARTICIPANTS, type JoinedCall } from "@shared/calls";

// Voice and video calls. Media goes through Cloudflare Realtime; these routes hand out a session, relay the signalling with
// our secret, and track who is in the call. Everything is checked against the chat: only people who can post in it
// join, and a person can only publish through their own session and pull tracks other participants announced.
// In a community channel a call is a voice channel: nobody is rung and no line is left in the history.
// API keys cannot reach /api/calls (shared/apiKeys.ts lists the apps they can).

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });
const need = () => {
  if (!callsEnabled()) throw new AppError(503, "Calls aren't set up here");
};

/** The caller's place in the call in this chat, or a 404/409. */
async function inCall(req: Request) {
  const me = callerId(req);
  const context = await loadChatContext(req.params.conversationId as string, me);
  const mine = callRegistry.get(String(context.chat._id))?.participants.get(me);
  if (!mine) throw new AppError(409, "You're not in this call");
  return { me, context, mine };
}

module.exports = function (app: Application) {
  // A person whose last tab closes leaves their calls.
  SocketManager.getInstance().onUserOffline((userId) => void leaveAllCalls(userId).catch(() => undefined));

  // Whether calls are set up (the call buttons are left out when they aren't).
  app.get("/api/calls/status", authenticateToken, (_req: Request, res: Response) =>
    ok(res, { enabled: callsEnabled() }),
  );

  app.get("/api/calls/ice-servers", authenticateToken, async (_req: Request, res: Response) => {
    need();
    ok(res, { iceServers: await iceServers() });
  });

  // The call going on in a chat, if there is one (for "Join call").
  app.get(
    "/api/calls/:conversationId",
    authenticateToken,
    validateParams(callParamSchema),
    async (req: Request, res: Response) => {
      const context = await loadChatContext(req.params.conversationId as string, callerId(req));
      const call = callRegistry.state(String(context.chat._id));
      const people = await loadPeople((call?.participants ?? []).map((p) => p.userId));
      ok(res, { call, people: [...people.values()] });
    },
  );

  app.post(
    "/api/calls/:conversationId/join",
    authenticateToken,
    validateParams(callParamSchema),
    validate(joinCallSchema),
    async (req: Request, res: Response) => {
      need();
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      if (!canPostChat(context.access, me)) throw new AppError(403, "You can't join calls here");
      const { video } = joinCallSchema.parse(req.body);
      const conversationId = String(context.chat._id);
      if (
        (callRegistry.get(conversationId)?.participants.size ?? 0) >= CALL_MAX_PARTICIPANTS &&
        !callRegistry.get(conversationId)?.participants.has(me)
      ) {
        throw new AppError(409, "This call is full");
      }

      const sessionId = await createSession();
      const joined = callRegistry.join(conversationId, me, sessionId, video);
      if (joined.full) throw new AppError(409, "This call is full");
      const name = (await loadCaller(req)).username ?? "Someone";
      if (joined.started && !isVoiceChannel(context)) await ringOthers(context, me, name, video);
      // Someone answered: the ringing stops, here and on the answerer's other devices.
      if (!joined.started) {
        callRegistry.setRingTimer(conversationId, undefined);
        realtime.toUsers([me], "call:ring", {
          conversationId,
          fromUserId: joined.call.startedBy,
          fromName: name,
          video,
          ringing: false,
        });
      }
      announceCall(context);
      const call = callRegistry.state(conversationId)!;
      const body: JoinedCall = {
        sessionId,
        people: [...(await loadPeople(call.participants.map((p) => p.userId))).values()],
        iceServers: await iceServers(),
        call,
      };
      ok(res, body);
    },
  );

  // Publish or pull tracks through your own session.
  app.post(
    "/api/calls/:conversationId/tracks",
    authenticateToken,
    validateParams(callParamSchema),
    validate(callTracksSchema),
    async (req: Request, res: Response) => {
      need();
      const { context, mine, me } = await inCall(req);
      const body = callTracksSchema.parse(req.body);
      const call = callRegistry.get(String(context.chat._id))!;
      for (const t of body.tracks) {
        if (t.location !== "remote") continue;
        const owner = [...call.participants.values()].find((p) => p.sessionId === t.sessionId);
        if (!owner || owner.userId === me || !Object.values(owner.tracks).includes(t.trackName)) {
          throw new AppError(400, "You can only pull tracks that someone in this call published");
        }
      }
      ok(res, await sessionTracks(mine.sessionId, body));
    },
  );

  app.put(
    "/api/calls/:conversationId/renegotiate",
    authenticateToken,
    validateParams(callParamSchema),
    validate(callRenegotiateSchema),
    async (req: Request, res: Response) => {
      need();
      const { mine } = await inCall(req);
      ok(res, await renegotiate(mine.sessionId, callRenegotiateSchema.parse(req.body).sessionDescription));
    },
  );

  app.put(
    "/api/calls/:conversationId/tracks/close",
    authenticateToken,
    validateParams(callParamSchema),
    validate(callCloseTracksSchema),
    async (req: Request, res: Response) => {
      need();
      const { mine } = await inCall(req);
      ok(res, await closeTracks(mine.sessionId, callCloseTracksSchema.parse(req.body)));
    },
  );

  // Say what you are publishing and whether you are muted, have the camera on, or are sharing the screen.
  app.put(
    "/api/calls/:conversationId/state",
    authenticateToken,
    validateParams(callParamSchema),
    validate(callStateSchema),
    async (req: Request, res: Response) => {
      const { me, context } = await inCall(req);
      callRegistry.update(String(context.chat._id), me, callStateSchema.parse(req.body));
      announceCall(context);
      ok(res, { call: callRegistry.state(String(context.chat._id)) });
    },
  );

  app.post(
    "/api/calls/:conversationId/leave",
    authenticateToken,
    validateParams(callParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      await leaveCall(context, me);
      ok(res, {});
    },
  );

  // Turn a ringing call down. In a two-person chat that is the end of it.
  app.post(
    "/api/calls/:conversationId/decline",
    authenticateToken,
    validateParams(callParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const conversationId = String(context.chat._id);
      const call = callRegistry.get(conversationId);
      if (!call || isVoiceChannel(context)) return ok(res, {});
      realtime.toUsers([me], "call:ring", {
        conversationId,
        fromUserId: call.startedBy,
        fromName: "",
        video: call.video,
        ringing: false,
      });
      if (context.chat.members.length === 2 && call.participants.size === 1 && !call.participants.has(me)) {
        await leaveCall(context, call.startedBy);
      }
      ok(res, {});
    },
  );
};
