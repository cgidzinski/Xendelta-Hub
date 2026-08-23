import { describe, it, expect, vi, beforeEach } from "vitest";

// pushUtils and emailUtils are real ESM imports in notificationUtils.ts, so module-level
// vi.mock intercepts them cleanly. The Notification and User models are pulled in with a
// literal `require(...)` (they're CommonJS mongoose models) — vi.mock can't hook those, so
// they're spied on directly below. The require() cache guarantees notificationUtils.ts sees
// the exact same objects this file mutates.
const { sendPushToUserMock, sendNotificationEmailMock } = vi.hoisted(() => ({
  sendPushToUserMock: vi.fn(),
  sendNotificationEmailMock: vi.fn(),
}));

vi.mock("./pushUtils", () => ({
  sendPushToUser: (...args: unknown[]) => sendPushToUserMock(...args),
}));

vi.mock("./emailUtils", () => ({
  sendNotificationEmail: (...args: unknown[]) => sendNotificationEmailMock(...args),
}));

import { notify, DEFAULT_CHANNELS } from "./notificationUtils";
import { SocketManager } from "../infrastructure/SocketManager";
const Notification = require("../models/notification");
const { User } = require("../models/user");

const USER_ID = "507f1f77bcf86cd799439011";

let sendNotificationSpy: ReturnType<typeof vi.fn>;

function mockUser(overrides: { email?: string | null; emailPref?: boolean } = {}) {
  vi.spyOn(User, "findById").mockReturnValue({
    select: () => ({
      exec: async () => ({
        email: overrides.email === null ? undefined : (overrides.email ?? "user@example.com"),
        username: "tester",
        notificationPrefs: { email: overrides.emailPref ?? false },
      }),
    }),
  } as any);
}

beforeEach(() => {
  vi.restoreAllMocks();
  sendPushToUserMock.mockReset().mockResolvedValue({ sent: 1, pruned: 0 });
  sendNotificationEmailMock.mockReset().mockResolvedValue({ success: true });

  // Mongoose documents construct fine without a connection; only save() would hit the DB.
  vi.spyOn(Notification.prototype, "save").mockResolvedValue(undefined as any);

  sendNotificationSpy = vi.fn();
  vi.spyOn(SocketManager, "getInstance").mockReturnValue({
    sendNotification: sendNotificationSpy,
  } as any);

  mockUser();
});

describe("notify channels", () => {
  it("defaults to in-app + socket + push, and not email", async () => {
    expect(DEFAULT_CHANNELS).toEqual(["inapp", "socket", "push"]);

    const result = await notify(USER_ID, { title: "New Expense", message: "Alice added lunch" });

    expect(result.inapp).toBe(true);
    expect(result.socket).toBe(true);
    expect(result.push).toEqual({ sent: 1, pruned: 0 });
    expect(result.email).toBe(false);

    expect(Notification.prototype.save).toHaveBeenCalledTimes(1);
    expect(sendNotificationSpy).toHaveBeenCalledTimes(1);
    expect(sendPushToUserMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("sends only the requested channels", async () => {
    const result = await notify(USER_ID, {
      title: "Quiet",
      message: "inbox only",
      channels: ["inapp"],
    });

    expect(result.inapp).toBe(true);
    expect(result.socket).toBe(false);
    expect(result.push).toEqual({ sent: 0, pruned: 0 });
    expect(sendNotificationSpy).not.toHaveBeenCalled();
    expect(sendPushToUserMock).not.toHaveBeenCalled();
  });

  it("passes the persisted id and link through to the push payload", async () => {
    await notify(USER_ID, {
      title: "Settlement Received",
      message: "Bob paid you 20 USD",
      link: "/internal/xensplit/groups/abc/overview",
    });

    const [userId, payload] = sendPushToUserMock.mock.calls[0];
    expect(userId).toBe(USER_ID);
    expect(payload.title).toBe("Settlement Received");
    expect(payload.body).toBe("Bob paid you 20 USD");
    expect(payload.url).toBe("/internal/xensplit/groups/abc/overview");
    // The deep-link/mark-read id must come from the saved document, not be undefined.
    expect(payload.notificationId).toMatch(/^[a-f0-9]{24}$/);
  });

  it("stamps the socket payload with the same time as the persisted document", async () => {
    await notify(USER_ID, { title: "T", message: "M", channels: ["inapp", "socket"] });

    // save() is spied on the prototype, so mock.instances[0] is the document notify() built.
    const saved = (Notification.prototype.save as any).mock.instances[0];
    const [, socketPayload] = sendNotificationSpy.mock.calls[0];
    expect(socketPayload.time).toBeTypeOf("string");
    expect(socketPayload.time).toBe(saved.time);
    expect(socketPayload._id).toBe(saved._id.toString());
  });
});

describe("notify channel isolation", () => {
  it("still delivers in-app and socket when push throws", async () => {
    sendPushToUserMock.mockRejectedValue(new Error("push service unreachable"));

    const result = await notify(USER_ID, { title: "T", message: "M" });

    expect(result.inapp).toBe(true);
    expect(result.socket).toBe(true);
    expect(result.push).toEqual({ sent: 0, pruned: 0 });
  });

  it("still delivers push when persisting the in-app record throws", async () => {
    vi.spyOn(Notification.prototype, "save").mockRejectedValue(new Error("mongo down"));

    const result = await notify(USER_ID, { title: "T", message: "M" });

    expect(result.inapp).toBe(false);
    expect(result.push).toEqual({ sent: 1, pruned: 0 });
    // No persisted record, so nothing to deep-link to.
    expect(sendPushToUserMock.mock.calls[0][1].notificationId).toBeUndefined();
  });

  it("still delivers push when the email channel throws", async () => {
    sendNotificationEmailMock.mockRejectedValue(new Error("resend down"));
    mockUser({ emailPref: true });

    const result = await notify(USER_ID, {
      title: "T",
      message: "M",
      channels: ["push", "email"],
    });

    expect(result.email).toBe(false);
    expect(result.push).toEqual({ sent: 1, pruned: 0 });
  });
});

describe("notify email channel", () => {
  it("sends when the user has opted in", async () => {
    mockUser({ emailPref: true });

    const result = await notify(USER_ID, {
      title: "New Expense",
      message: "Alice added lunch",
      link: "/internal/xensplit/groups/abc/expenses",
      channels: ["email"],
    });

    expect(result.email).toBe(true);
    expect(sendNotificationEmailMock).toHaveBeenCalledWith({
      username: "tester",
      email: "user@example.com",
      title: "New Expense",
      message: "Alice added lunch",
      link: "/internal/xensplit/groups/abc/expenses",
    });
  });

  it("skips users who have not opted in", async () => {
    mockUser({ emailPref: false });

    const result = await notify(USER_ID, { title: "T", message: "M", channels: ["email"] });

    expect(result.email).toBe(false);
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("skips users with no email address", async () => {
    mockUser({ email: null, emailPref: true });

    const result = await notify(USER_ID, { title: "T", message: "M", channels: ["email"] });

    expect(result.email).toBe(false);
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });
});
