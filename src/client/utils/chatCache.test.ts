import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@shared/chat";
import { chronological, patchMessage, upsertMessage, type LocalMessage, type MessagesData } from "./chatCache";
import { systemText, dayLabel } from "../routes/Internal/Messages/chatUi";

const msg = (seq: number, extra: Partial<LocalMessage> = {}): LocalMessage => ({
  _id: `m${seq}`,
  conversationId: "c1",
  seq,
  from: "a",
  kind: "text",
  body: `message ${seq}`,
  attachments: [],
  reactions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});
const data = (...pages: LocalMessage[][]): MessagesData => ({
  pageParams: pages.map(() => undefined),
  pages: pages.map((messages) => ({ messages, hasMore: false, people: [] })),
});

describe("chat cache", () => {
  it("puts a new message at the front of the newest page, in order", () => {
    const next = upsertMessage(data([msg(3), msg(2)], [msg(1)]), msg(4));
    expect(next!.pages[0].messages.map((m) => m.seq)).toEqual([4, 3, 2]);
    expect(next!.pages[1].messages.map((m) => m.seq)).toEqual([1]);
  });

  it("turns the message being sent into the stored one, in place, when it arrives (by clientId)", () => {
    const sending = msg(Number.MAX_SAFE_INTEGER, { _id: "local-x", clientId: "x", status: "sending" });
    const stored: ChatMessage = { ...msg(5), clientId: "x" };
    const next = upsertMessage(data([sending, msg(4)]), stored)!;
    expect(next.pages[0].messages.map((m) => m._id)).toEqual(["m5", "m4"]);
    expect(next.pages[0].messages[0].status).toBeUndefined();
  });

  it("never leaves a duplicate when the live event and the send response both arrive", () => {
    const sending = msg(Number.MAX_SAFE_INTEGER, { _id: "local-x", clientId: "x", status: "sending" });
    const stored: ChatMessage = { ...msg(5), clientId: "x" };
    let next = upsertMessage(data([sending]), stored)!; // the socket event
    next = upsertMessage(next, stored)!; // the HTTP response
    expect(next.pages[0].messages).toHaveLength(1);
  });

  it("replaces a message with its edited version without moving it", () => {
    const next = patchMessage(data([msg(2), msg(1)]), { ...msg(1), body: "edited" })!;
    expect(next.pages[0].messages.map((m) => m.body)).toEqual(["message 2", "edited"]);
  });

  it("lists everything oldest first, with unsent messages last", () => {
    const sending = msg(Number.MAX_SAFE_INTEGER, { _id: "local-y", clientId: "y", status: "sending" });
    expect(chronological(data([sending, msg(3), msg(2)], [msg(1)])).map((m) => m._id)).toEqual([
      "m1",
      "m2",
      "m3",
      "local-y",
    ]);
  });

  it("does nothing before the history has loaded", () => {
    expect(upsertMessage(undefined, msg(1))).toBeUndefined();
  });
});

describe("chat wording", () => {
  const lookup = (id?: string | null) =>
    id === "alex"
      ? { _id: "alex", username: "Alex", avatar: "" }
      : id === "jo"
        ? { _id: "jo", username: "Jo", avatar: "" }
        : undefined;
  const system = (event: any, userIds: string[], name?: string): ChatMessage => ({
    ...msg(1, { kind: "system", from: null, body: "fallback" }),
    system: { event, userIds, name },
  });

  it("words system lines for the reader", () => {
    expect(systemText(system("added", ["me", "jo"]), lookup, "me")).toBe("You added Jo");
    expect(systemText(system("added", ["alex", "me"]), lookup, "me")).toBe("Alex added you");
    expect(systemText(system("left", ["alex"]), lookup, "me")).toBe("Alex left");
    expect(systemText(system("renamed", ["me"], "Trip"), lookup, "me")).toBe("You named the chat “Trip”");
    expect(systemText(system("renamed", ["me"]), lookup, "me")).toBe("You removed the chat name");
  });

  it("labels days", () => {
    const now = new Date("2026-03-10T12:00:00");
    expect(dayLabel("2026-03-10T08:00:00", now)).toBe("Today");
    expect(dayLabel("2026-03-09T08:00:00", now)).toBe("Yesterday");
  });
});
