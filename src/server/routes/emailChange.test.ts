import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Changing the account's email: password, a link to the new address, the change only on opening it.
const confirms: Array<{ email: string; confirmUrl: string }> = [];
const notices: Array<{ email: string; newEmail: string }> = [];
let sendWorks = true;
vi.mock("../utils/emailUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  sendEmailChangeConfirmEmail: vi.fn(async (a: { email: string; confirmUrl: string }) => {
    if (!sendWorks) return { success: false, error: "down" };
    confirms.push(a);
    return { success: true };
  }),
  sendEmailChangedNotice: vi.fn(async (a: { email: string; newEmail: string }) => {
    notices.push(a);
    return { success: true };
  }),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./emailChange.js"), () => import("./users.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  confirms.length = 0;
  notices.length = 0;
  sendWorks = true;
});

const User = () => mongoose.model("User") as any;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
/** A person who signs in with a password (createUser's default password isn't a real hash). */
async function withPassword(password = "hunter22") {
  const made = await createUser();
  const doc = await User().findById(made.user._id);
  doc.password = doc.generateHash(password);
  doc.authProviders.push({ provider: "local", email: doc.email, isActive: true });
  await doc.save();
  return { ...made, password };
}
const ask = (token: string, body: object) => request(t.app).post("/api/user/email-change").set(auth(token)).send(body);
const confirm = (token: string) => request(t.app).post("/api/auth/confirm-email-change").send({ token });

describe("changing email", () => {
  it("sends a link to the new address, and only changes the email when it is opened", async () => {
    const me = await withPassword();
    const oldEmail = me.user.email;
    const res = await ask(me.token, { newEmail: "New.Address@Example.com", password: me.password });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(confirms).toHaveLength(1);
    expect(confirms[0].email).toBe("new.address@example.com");

    // Nothing has changed yet, and the profile says what is waiting.
    expect((await User().findById(me.user._id)).email).toBe(oldEmail);
    const profile = (await request(t.app).get("/api/user/profile").set(auth(me.token))).body.data.user;
    expect(profile).toMatchObject({ email: oldEmail, canChangeEmail: true, pendingEmail: "new.address@example.com" });

    const done = await confirm(tokenOf(confirms[0].confirmUrl));
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.data.email).toBe("new.address@example.com");
    const after = await User().findById(me.user._id);
    expect(after.email).toBe("new.address@example.com");
    expect(after.authProviders.find((p: any) => p.provider === "local").email).toBe("new.address@example.com");
    expect(after.pendingEmail?.email).toBeUndefined();
    expect(notices).toEqual([{ username: after.username, email: oldEmail, newEmail: "new.address@example.com" }]);
    expect((await request(t.app).get("/api/user/profile").set(auth(me.token))).body.data.user.pendingEmail).toBeNull();
  });

  it("can't be confirmed twice, with a wrong token, or after it expires", async () => {
    const me = await withPassword();
    await ask(me.token, { newEmail: "a@example.com", password: me.password });
    const token = tokenOf(confirms[0].confirmUrl);

    expect((await confirm("x".repeat(40))).status).toBe(400);
    await User().updateOne({ _id: me.user._id }, { "pendingEmail.expires": new Date(Date.now() - 1000) });
    expect((await confirm(token)).status).toBe(400);

    await ask(me.token, { newEmail: "a@example.com", password: me.password });
    const fresh = tokenOf(confirms[1].confirmUrl);
    expect((await confirm(fresh)).status).toBe(200);
    expect((await confirm(fresh)).status).toBe(400);
  });

  it("asking again replaces the earlier link", async () => {
    const me = await withPassword();
    await ask(me.token, { newEmail: "first@example.com", password: me.password });
    await ask(me.token, { newEmail: "second@example.com", password: me.password });
    expect((await confirm(tokenOf(confirms[0].confirmUrl))).status).toBe(400);
    expect((await confirm(tokenOf(confirms[1].confirmUrl))).status).toBe(200);
    expect((await User().findById(me.user._id)).email).toBe("second@example.com");
  });

  it("needs the right password, and refuses addresses that are the same, taken, or not an email", async () => {
    const me = await withPassword();
    const other = await createUser();
    expect((await ask(me.token, { newEmail: "x@example.com", password: "wrong" })).status).toBe(400);
    expect((await ask(me.token, { newEmail: me.user.email, password: me.password })).status).toBe(400);
    expect((await ask(me.token, { newEmail: other.user.email, password: me.password })).status).toBe(409);
    expect((await ask(me.token, { newEmail: "not-an-email", password: me.password })).status).toBe(400);
    expect((await ask(me.token, { newEmail: "x@example.com" })).status).toBe(400);
    expect(confirms).toHaveLength(0);
  });

  it("refuses an address someone else took while the link was waiting", async () => {
    const me = await withPassword();
    await ask(me.token, { newEmail: "race@example.com", password: me.password });
    await createUser({ email: "race@example.com" });
    expect((await confirm(tokenOf(confirms[0].confirmUrl))).status).toBe(409);
    expect((await User().findById(me.user._id)).email).toBe(me.user.email);
  });

  it("is for accounts with a password, and needs sign-in", async () => {
    const oauth = await createUser({ password: undefined });
    const res = await ask(oauth.token, { newEmail: "x@example.com", password: "whatever" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Google or GitHub/);
    expect((await request(t.app).get("/api/user/profile").set(auth(oauth.token))).body.data.user.canChangeEmail).toBe(
      false,
    );
    expect((await request(t.app).post("/api/user/email-change").send({})).status).toBe(401);
  });

  it("leaves the email alone and clears the request when the email can't be sent", async () => {
    const me = await withPassword();
    sendWorks = false;
    const res = await ask(me.token, { newEmail: "down@example.com", password: me.password });
    expect(res.status).toBe(502);
    const after = await User().findById(me.user._id);
    expect(after.email).toBe(me.user.email);
    expect(after.pendingEmail?.email).toBeUndefined();
  });
});
