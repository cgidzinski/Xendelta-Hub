import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

// The admin billing report: measured usage per center, what it billed, and the providers' real costs beside it.

let t: TestApp;
let adminUser: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  t = await startTestApp([() => import("./index.js")]);
  adminUser = await createUser({ roles: ["admin"], username: "boss" });
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const report = (month: string) => request(t.app).get(`/api/admin/billing?month=${month}`).set(as(adminUser.token));
const setCost = (month: string, provider: string, amountCents: number | null) =>
  request(t.app).put(`/api/admin/billing/costs/${month}/${provider}`).set(as(adminUser.token)).send({ amountCents });

describe("admin billing report", () => {
  it("is for admins only", async () => {
    const { token } = await createUser();
    expect((await request(t.app).get("/api/admin/billing").set(as(token))).status).toBe(403);
  });

  it("lists every center with its measured usage, people, communities and the house together", async () => {
    const { recordUsage } = await import("../../billing/usage.js");
    const { userAccount, communityAccount, HOUSE } = await import("../../billing/ledger.js");
    const at = new Date(Date.UTC(2026, 8, 10));
    await recordUsage(userAccount(new mongoose.Types.ObjectId()), "downloads", 2_000_000_000, at);
    await recordUsage(communityAccount(new mongoose.Types.ObjectId()), "downloads", 1_000_000_000, at);
    await recordUsage(HOUSE, "email", 12, at);

    const res = await report("2026-09");
    expect(res.status).toBe(200);
    const r = res.body.data.report;
    expect(r).toMatchObject({ month: "2026-09", everythingFree: true, enforced: false });
    expect(r.months).toContain("2026-09");
    expect(r.centers.find((c: any) => c.center === "downloads")).toMatchObject({ units: 3_000_000_000, quantity: 3 });
    expect(r.centers.find((c: any) => c.center === "email")).toMatchObject({ units: 12, payer: "house" });
    expect(r.providers.map((p: any) => p.provider).sort()).toEqual(
      ["cloud_storage", "cloudflare_ai", "cloudflare_realtime", "resend"].sort(),
    );
  });

  it("records a provider's actual cost in gems, audits it, and can clear it", async () => {
    const saved = await setCost("2026-09", "cloud_storage", 250);
    expect(saved.status).toBe(200);
    const row = saved.body.data.report.providers.find((p: any) => p.provider === "cloud_storage");
    expect(row).toMatchObject({ actualCents: 250, actualGems: 2500 });
    const audits = await mongoose.model("AdminAudit").find({ action: "provider_cost_set" }).lean<any[]>();
    expect(audits).toHaveLength(1);

    const cleared = await setCost("2026-09", "cloud_storage", null);
    expect(cleared.body.data.report.providers.find((p: any) => p.provider === "cloud_storage").actualCents).toBeNull();
  });

  it("validates the month, the provider and the amount", async () => {
    expect((await report("2026-13")).status).toBe(400);
    expect((await setCost("2026-09", "aws", 1)).status).toBe(400);
    expect((await setCost("26-09", "resend", 1)).status).toBe(400);
    expect((await setCost("2026-09", "resend", -1)).status).toBe(400);
  });
});
