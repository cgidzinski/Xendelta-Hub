import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";
import { callRegistry } from "../../calls/registry";
import { clearIceCache } from "../../calls/cloudflare";
import { CALL_RING_SECONDS } from "@shared/calls";

const SECRET = "app-secret-xyz";
let t: TestApp;
let events: Array<{ room: string; event: string; payload: any }> = [];
let fetchMock: ReturnType<typeof vi.fn>;
let sessionCounter = 0;

beforeAll(async () => {
  t = await startTestApp([
    () => import("../communities/index.js"),
    () => import("../chat/index.js"),
    () => import("./index.js"),
  ]);
  const { SocketManager } = await import("../../infrastructure/SocketManager.js");
  (SocketManager.getInstance() as any).io = {
    to: (room: string) => ({ emit: (event: string, payload: any) => events.push({ room, event, payload }) }),
    sockets: { adapter: { rooms: new Map() } },
  };
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
beforeEach(() => {
  process.env.CLOUDFLARE_REALTIME_APP_ID = "appid";
  process.env.CLOUDFLARE_REALTIME_APP_SECRET = SECRET;
  process.env.CLOUDFLARE_TURN_KEY_ID = "turnkey";
  process.env.CLOUDFLARE_TURN_API_TOKEN = "turn-token";
  events = [];
  sessionCounter = 0;
  clearIceCache();
  callRegistry.reset();
  fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.endsWith("/sessions/new")) return json({ sessionId: `session${String(++sessionCounter).padStart(8, "0")}` });
    if (u.includes("generate-ice-servers"))
      return json({
        iceServers: [
          { urls: ["stun:stun.example:3478"] },
          { urls: ["turn:turn.example:3478"], username: "u", credential: "c" },
        ],
      });
    if (u.includes("/tracks/new"))
      return json({ sessionDescription: { type: "answer", sdp: "v=0 answer" }, tracks: [] });
    if (u.includes("/renegotiate") || u.includes("/tracks/close")) return json({ ok: true });
    return new Response("?", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const k of [
    "CLOUDFLARE_REALTIME_APP_ID",
    "CLOUDFLARE_REALTIME_APP_SECRET",
    "CLOUDFLARE_TURN_KEY_ID",
    "CLOUDFLARE_TURN_API_TOKEN",
  ])
    delete process.env[k];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);
const dm = async (a: U, b: U, name?: string) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(a))
      .send({ userIds: [id(b)], name })
  ).body.data.conversation._id as string;
const join = (who: U, chat: string, video = false) =>
  request(t.app).post(`/api/calls/${chat}/join`).set(as(who)).send({ video });
const leave = (who: U, chat: string) => request(t.app).post(`/api/calls/${chat}/leave`).set(as(who));
const lines = async (who: U, chat: string) =>
  ((await request(t.app).get(`/api/chat/conversations/${chat}/messages`).set(as(who))).body.data.messages as any[])
    .filter((m) => m.kind === "system" && /call/i.test(m.body))
    .map((m) => m.body);

describe("set up", () => {
  it("says whether calls are on, and refuses to join when they are off", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    expect((await request(t.app).get("/api/calls/status").set(as(a))).body.data).toEqual({ enabled: true });
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    expect((await request(t.app).get("/api/calls/status").set(as(a))).body.data).toEqual({ enabled: false });
    expect((await join(a, chat)).status).toBe(503);
    expect((await request(t.app).get("/api/calls/ice-servers").set(as(a))).status).toBe(503);
  });

  it("hands out ICE servers, remembered for a while, and never the secrets", async () => {
    const a = await createUser();
    const res = await request(t.app).get("/api/calls/ice-servers").set(as(a));
    expect(res.status).toBe(200);
    expect(res.body.data.iceServers).toHaveLength(2);
    await request(t.app).get("/api/calls/ice-servers").set(as(a));
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("generate-ice-servers"))).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("turn-token");
    expect((await request(t.app).get("/api/calls/ice-servers")).status).toBe(401);
  });
});

describe("joining and ringing", () => {
  it("starting a call in a chat creates a session, rings the others, and tells the chat", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    const res = await join(a, chat, true);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.sessionId).toBe("session00000001");
    expect(res.body.data.iceServers).toHaveLength(2);
    expect(res.body.data.call).toMatchObject({ conversationId: chat, startedBy: id(a), video: true, kind: "direct" });
    expect(res.body.data.call.participants.map((p: any) => p.userId)).toEqual([id(a)]);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    // the Cloudflare call carried the secret
    const sessionCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/sessions/new"))!;
    expect((sessionCall[1] as any).headers.Authorization).toBe(`Bearer ${SECRET}`);

    const rings = events.filter((e) => e.event === "call:ring");
    expect(rings.map((e) => e.room)).toEqual([`user:${id(b)}`]);
    expect(rings[0].payload).toMatchObject({ conversationId: chat, fromUserId: id(a), video: true, ringing: true });
    expect(
      events
        .filter((e) => e.event === "call:state")
        .map((e) => e.room)
        .sort(),
    ).toEqual([`user:${id(a)}`, `user:${id(b)}`].sort());
    // and the chat can see it going on
    expect((await request(t.app).get(`/api/calls/${chat}`).set(as(b))).body.data.call.participants).toHaveLength(1);
  });

  it("answering stops the ringing, and the call lists both people", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    await join(a, chat);
    events = [];
    const res = await join(b, chat);
    expect(res.body.data.sessionId).toBe("session00000002");
    expect(res.body.data.call.participants.map((p: any) => p.userId).sort()).toEqual([id(a), id(b)].sort());
    expect(
      events.some((e) => e.event === "call:ring" && e.payload.ringing === false && e.room === `user:${id(b)}`),
    ).toBe(true);
    expect(events.some((e) => e.event === "call:ring" && e.payload.ringing === true)).toBe(false);
  });

  it("only people in the chat can see or join, and a read-only channel can't be joined", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const chat = await dm(a, b);
    expect((await join(outsider, chat)).status).toBe(404);
    expect((await request(t.app).get(`/api/calls/${chat}`).set(as(outsider))).status).toBe(404);
    const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
      .community;
    const { Community } = await import("../../models/community.js");
    await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(b), role: "member" } } });
    const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: general._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["sendMessages"] }] },
    );
    expect((await join(b, general._id)).status).toBe(403);
  });

  it("is limited in size, and validates what it is given", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    expect((await request(t.app).post(`/api/calls/${chat}/join`).set(as(a)).send({ video: "yes" })).status).toBe(400);
    expect((await request(t.app).post("/api/calls/nope/join").set(as(a)).send({})).status).toBe(400);
  });

  it("a Cloudflare failure is answered plainly, with no secret or address", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
    const res = await join(a, chat);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(res.body.message).not.toMatch(/cloudflare|https?:/i);
    expect(callRegistry.get(chat)).toBeUndefined();
  });
});

describe("media", () => {
  const publish = (who: U, chat: string, body: unknown) =>
    request(t.app)
      .post(`/api/calls/${chat}/tracks`)
      .set(as(who))
      .send(body as object);
  const setup = async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const chat = await dm(a, b);
    const ja = await join(a, chat);
    const jb = await join(b, chat);
    return { a, b, c, chat, sa: ja.body.data.sessionId as string, sb: jb.body.data.sessionId as string };
  };

  it("publishes through your own session only, and passes Cloudflare's answer back", async () => {
    const { a, chat, sa } = await setup();
    const res = await publish(a, chat, {
      sessionDescription: { type: "offer", sdp: "v=0 offer" },
      tracks: [{ location: "local", mid: "0", trackName: "mic-a" }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.sessionDescription.type).toBe("answer");
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes(`/sessions/${sa}/tracks/new`));
    expect(call).toBeTruthy();
    expect(JSON.parse((call![1] as any).body).tracks[0]).toEqual({ location: "local", mid: "0", trackName: "mic-a" });
  });

  it("pulls only what another person in the call announced", async () => {
    const { a, b, chat, sa } = await setup();
    const pull = (name: string, sessionId = sa) =>
      publish(b, chat, { tracks: [{ location: "remote", sessionId, trackName: name }] });
    expect((await pull("mic-a")).status).toBe(400); // not announced yet
    await request(t.app)
      .put(`/api/calls/${chat}/state`)
      .set(as(a))
      .send({ tracks: { audio: "mic-a" } });
    expect((await pull("mic-a")).status).toBe(200);
    expect((await pull("other-track")).status).toBe(400);
    expect((await pull("mic-a", "someoneelsessession")).status).toBe(400);
    // you can't pull your own
    await request(t.app)
      .put(`/api/calls/${chat}/state`)
      .set(as(b))
      .send({ tracks: { audio: "mic-b" } });
    expect(
      (await publish(b, chat, { tracks: [{ location: "remote", sessionId: "session00000002", trackName: "mic-b" }] }))
        .status,
    ).toBe(400);
  });

  it("needs you to be in the call, and validates the signalling", async () => {
    const { a, c, chat } = await setup();
    const ok = { tracks: [{ location: "local", mid: "0", trackName: "x" }] };
    expect((await publish(c, chat, ok)).status).toBe(404); // not in the chat
    const d = await createUser();
    const other = await dm(c, d);
    expect((await publish(c, other, ok)).status).toBe(409); // in the chat, not in a call
    expect((await publish(a, chat, { tracks: [] })).status).toBe(400);
    expect((await publish(a, chat, { tracks: [{ location: "local", mid: "0", trackName: "bad name!" }] })).status).toBe(
      400,
    );
    expect((await publish(a, chat, { tracks: Array(11).fill(ok.tracks[0]) })).status).toBe(400);
    expect((await publish(a, chat, { sessionDescription: { type: "offer", sdp: "" }, ...ok })).status).toBe(400);
    expect(
      (
        await request(t.app)
          .put(`/api/calls/${chat}/renegotiate`)
          .set(as(a))
          .send({ sessionDescription: { type: "offer", sdp: "x" } })
      ).body.data,
    ).toBeUndefined();
  });

  it("renegotiates and closes tracks through your session", async () => {
    const { a, chat, sa } = await setup();
    const re = await request(t.app)
      .put(`/api/calls/${chat}/renegotiate`)
      .set(as(a))
      .send({ sessionDescription: { type: "answer", sdp: "v=0" } });
    expect(re.status).toBe(200);
    const close = await request(t.app)
      .put(`/api/calls/${chat}/tracks/close`)
      .set(as(a))
      .send({ tracks: [{ mid: "1" }], force: true });
    expect(close.status).toBe(200);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes(`/sessions/${sa}/renegotiate`))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes(`/sessions/${sa}/tracks/close`))).toBe(true);
  });

  it("what you say about your own media is shown to the call", async () => {
    const { a, chat } = await setup();
    events = [];
    const res = await request(t.app)
      .put(`/api/calls/${chat}/state`)
      .set(as(a))
      .send({ muted: true, cameraOn: true, screenOn: true });
    expect(res.status).toBe(200);
    expect(res.body.data.call.participants.find((p: any) => p.userId === id(a))).toMatchObject({
      muted: true,
      cameraOn: true,
      screenOn: true,
    });
    expect(events.some((e) => e.event === "call:state")).toBe(true);
    expect((await request(t.app).put(`/api/calls/${chat}/state`).set(as(a)).send({})).status).toBe(400);
  });
});

describe("ending", () => {
  it("leaves a line saying how long it lasted, once the last person leaves", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b, "Trip");
    await join(a, chat);
    await join(b, chat);
    await leave(a, chat);
    expect((await request(t.app).get(`/api/calls/${chat}`).set(as(b))).body.data.call.participants).toHaveLength(1);
    expect(await lines(a, chat)).toEqual([]);
    events = [];
    await leave(b, chat);
    expect((await request(t.app).get(`/api/calls/${chat}`).set(as(a))).body.data.call).toBeNull();
    expect(await lines(a, chat)).toEqual(["Call · 1 sec"]);
    expect(events.some((e) => e.event === "call:state" && e.payload.call === null)).toBe(true);
  });

  it("a call nobody answers is a missed call, after the ring time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b, "Trip");
    await join(a, chat);
    await vi.advanceTimersByTimeAsync((CALL_RING_SECONDS + 1) * 1000);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 300));
    expect(callRegistry.get(chat)).toBeUndefined();
    expect(await lines(b, chat)).toEqual(["Missed call"]);
    expect(
      events.some((e) => e.event === "call:ring" && e.payload.ringing === false && e.room === `user:${id(b)}`),
    ).toBe(true);
  });

  it("declining a two-person call ends it as missed", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b, "Pair");
    await join(a, chat);
    const res = await request(t.app).post(`/api/calls/${chat}/decline`).set(as(b));
    expect(res.status).toBe(200);
    expect(callRegistry.get(chat)).toBeUndefined();
    expect(await lines(a, chat)).toEqual(["Missed call"]);
  });

  it("closing the last tab takes a person out of their calls", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    await join(a, chat);
    await join(b, chat);
    const { leaveAllCalls } = await import("../../calls/service.js");
    await leaveAllCalls(id(b));
    expect(callRegistry.get(chat)!.participants.size).toBe(1);
  });
});

describe("voice channels", () => {
  it("a community channel call rings nobody and leaves no line in the history", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
      .community;
    const { Community } = await import("../../models/community.js");
    await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(b), role: "member" } } });
    const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;
    events = [];
    await join(a, general._id);
    await join(b, general._id);
    expect(events.some((e) => e.event === "call:ring" && e.payload.ringing === true)).toBe(false);
    await leave(a, general._id);
    await leave(b, general._id);
    expect(await lines(a, general._id)).toEqual([]);
    expect(callRegistry.get(general._id)).toBeUndefined();
  });
});

describe("calls on the bill", () => {
  const usageOf = async (account: { type: "user" | "community"; id: string }, month?: string) => {
    const { usageFor } = await import("../../billing/usage.js");
    return (await usageFor(account, month)).find((l) => l.center === "calls")?.units ?? 0;
  };
  const AUDIO = 32_000;
  const VIDEO = 1_500_000;

  it("splits a call's cost evenly between the people in it, from what each sends (as capped)", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    await join(a, chat);
    await join(b, chat);
    const { meterCall } = await import("../../calls/usage.js");
    callRegistry.update(chat, id(a), { cameraOn: true });
    const call = callRegistry.get(chat)!;
    call.lastMeteredAt = Date.now() - 60_000; // a minute of both sending audio, and a's camera on
    await meterCall(chat);

    // Each person receives the other's media: (a: audio + video) + (b: audio), for 60 s, shared by the two.
    const total = ((AUDIO + VIDEO + AUDIO) / 8) * 60;
    expect(await usageOf({ type: "user", id: id(a) })).toBe(Math.round(total / 2));
    expect(await usageOf({ type: "user", id: id(b) })).toBe(Math.round(total / 2));
  });

  it("is nothing while one person is alone in the call, or everyone is muted with the camera off", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    await join(a, chat);
    const { meterCall } = await import("../../calls/usage.js");
    callRegistry.get(chat)!.lastMeteredAt = Date.now() - 60_000;
    await meterCall(chat);
    expect(await usageOf({ type: "user", id: id(a) })).toBe(0);
    await join(b, chat);
    callRegistry.update(chat, id(a), { muted: true });
    callRegistry.update(chat, id(b), { muted: true });
    callRegistry.get(chat)!.lastMeteredAt = Date.now() - 60_000;
    await meterCall(chat);
    expect(await usageOf({ type: "user", id: id(a) })).toBe(0);
  });

  it("is the community's cost in a voice channel", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
      .community;
    const { Community } = await import("../../models/community.js");
    await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(b), role: "member" } } });
    const made = await request(t.app)
      .post(`/api/communities/${community._id}/channels`)
      .set(as(a))
      .send({ name: "Lounge", kind: "voice" });
    const general = made.body.data.channel;
    expect((await join(a, general._id)).status).toBe(200);
    expect((await join(b, general._id)).status).toBe(200);
    const { meterCall } = await import("../../calls/usage.js");
    callRegistry.get(general._id)!.lastMeteredAt = Date.now() - 30_000;
    await meterCall(general._id);
    expect(await usageOf({ type: "community", id: String(community._id) })).toBe(Math.round(((2 * AUDIO) / 8) * 30));
    expect(await usageOf({ type: "user", id: id(a) })).toBe(0);
  });

  it("refuses to join once billing is enforced and the free allowance is used up, warns, then ends the call", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    const { recordUsage } = await import("../../billing/usage.js");
    const { userAccount } = await import("../../billing/ledger.js");
    await recordUsage(userAccount(a.user._id), "calls", 1_000 * 1_000_000_000); // 1,000 GB: far past the allowance
    expect((await join(a, chat)).status).toBe(200); // shadow mode lets it through
    await leave(a, chat);

    process.env.BILLING_ENFORCED = "true";
    try {
      const refused = await join(a, chat);
      expect(refused.status).toBe(402);
      expect(refused.body).toMatchObject({ billing: true });

      // b can still join. If a's allowance ran out mid-call they are warned, then taken out on the next check.
      process.env.BILLING_ENFORCED = "false";
      await join(a, chat);
      await join(b, chat);
      process.env.BILLING_ENFORCED = "true";
      events = [];
      const { enforceCallBilling } = await import("../../calls/meter.js");
      await enforceCallBilling(chat);
      expect(events.find((e) => e.event === "call:billing")?.payload).toMatchObject({ ending: false });
      expect(callRegistry.get(chat)?.participants.has(id(a))).toBe(true);
      await enforceCallBilling(chat);
      expect(events.some((e) => e.event === "call:billing" && e.payload.ending === true)).toBe(true);
      expect(callRegistry.get(chat)?.participants.has(id(a))).toBeFalsy();
    } finally {
      process.env.BILLING_ENFORCED = "false";
    }
  });
});
