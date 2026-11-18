import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { receiptFromParts, parseAmount } from "../utils/receiptImport";

// Reading a receipt out of a photo, through the real route. Cloudflare is replaced by a fake fetch.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xensplit.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const scan = async (who: U) =>
  request(t.app)
    .post("/api/xensplit/scan-receipt")
    .set({ Authorization: `Bearer ${who.token}` })
    .attach(
      "image",
      await sharp({ create: { width: 40, height: 60, channels: 3, background: "#ffffff" } })
        .png()
        .toBuffer(),
      { filename: "receipt.png", contentType: "image/png" },
    );

const RECEIPT = {
  merchant: "Corner Cafe",
  date: "2026-11-03",
  currency: "cad",
  items: [
    { name: "Latte", amount: "$4.50" },
    { name: "Bagel", amount: "3.25" },
    { name: "Subtotal", amount: "7.75" },
  ],
  tax: "1.00",
  tip: "",
  total: "8.75",
};

function fakeCloudflare(result: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result, success: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const receiptScansUsed = async (who: U) => {
  const { usageFor } = await import("../billing/usage.js");
  const { userAccount } = await import("../billing/ledger.js");
  return (await usageFor(userAccount(who.user._id))).find((l) => l.center === "receipt_scans")?.units;
};

beforeEach(() => {
  process.env.CLOUDFLARE_AI_ACCOUNT_ID = "test-account";
  process.env.CLOUDFLARE_AI_TOKEN = "test-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_AI_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_AI_TOKEN;
});

describe("reading a receipt from a photo", () => {
  it("returns the lines, drops the arithmetic rows, and bills one receipt scan", async () => {
    const me = await createUser();
    const fetchMock = fakeCloudflare({ response: RECEIPT });

    const res = await scan(me);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.receipt).toEqual({
      merchant: "Corner Cafe",
      date: "2026-11-03",
      currency: "CAD",
      items: [
        { name: "Latte", amount: 4.5 },
        { name: "Bagel", amount: 3.25 },
      ],
      tax: 1,
      tip: 0,
      total: 8.75,
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.guided_json).toBeTruthy();
    expect(body.messages[0].content.some((p: any) => p.type === "image_url")).toBe(true);
    expect(await receiptScansUsed(me)).toBe(1);
  });

  it("answers 422 when no items are found, and still counts the scan", async () => {
    const me = await createUser();
    fakeCloudflare({ response: { merchant: "", date: "", currency: "", items: [], tax: "", tip: "", total: "" } });
    expect((await scan(me)).status).toBe(422);
    expect(await receiptScansUsed(me)).toBe(1);
  });

  it("is refused (402) and not charged once the allowance is used up", async () => {
    const me = await createUser();
    fakeCloudflare({ response: RECEIPT });
    const { recordUsage } = await import("../billing/usage.js");
    const { userAccount } = await import("../billing/ledger.js");
    await recordUsage(userAccount(me.user._id), "receipt_scans", 100_000);
    expect((await scan(me)).status).toBe(402);
    expect(await receiptScansUsed(me)).toBe(100_000);
  });

  it("answers 503 without Cloudflare credentials, and reports that on the status route", async () => {
    const me = await createUser();
    delete process.env.CLOUDFLARE_AI_ACCOUNT_ID;
    expect((await scan(me)).status).toBe(503);
    const status = await request(t.app)
      .get("/api/xensplit/scan-receipt/status")
      .set({ Authorization: `Bearer ${me.token}` });
    expect(status.body.data.receipt_scan).toBe(false);
  });

  it("refuses a request with no photo", async () => {
    const me = await createUser();
    const res = await request(t.app)
      .post("/api/xensplit/scan-receipt")
      .set({ Authorization: `Bearer ${me.token}` });
    expect(res.status).toBe(400);
  });
});

describe("receipt parsing", () => {
  it("reads amounts as people write them", () => {
    expect(parseAmount("$1,234.50")).toBe(1234.5);
    expect(parseAmount("12,99")).toBe(12.99);
    expect(parseAmount("(3.00)")).toBe(-3);
    expect(parseAmount("n/a")).toBe(0);
  });

  it("falls back to the lines' sum when the total is missing, and ignores a bad date", () => {
    const r = receiptFromParts({ items: [{ name: "A", amount: "2.00" }], tax: "0.26", tip: "", total: "", date: "x" });
    expect(r).toMatchObject({ total: 2.26, date: "" });
    expect(receiptFromParts(null)).toBeNull();
  });
});
