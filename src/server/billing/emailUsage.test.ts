import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestApp, type TestApp } from "../testing/testApp";

// Emails are the house's cost: each one sent is counted on the house account, for the admin report. No email goes out here.
const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("email usage", () => {
  it("counts an email that was sent, and not one that failed", async () => {
    const { sendNotificationEmail } = await import("../utils/emailUtils.js");
    const { usageFor } = await import("./usage.js");
    const emails = async () => (await usageFor({ type: "house" })).find((l) => l.center === "email")?.units ?? 0;

    send.mockResolvedValue({ error: null });
    await sendNotificationEmail({ username: "a", email: "a@example.test", title: "Hi", message: "Hello" });
    expect(await emails()).toBe(1);

    send.mockResolvedValue({ error: { message: "nope" } });
    await sendNotificationEmail({ username: "a", email: "a@example.test", title: "Hi", message: "Hello" });
    expect(await emails()).toBe(1);
  });
});
