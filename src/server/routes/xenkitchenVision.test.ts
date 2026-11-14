import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Reading a recipe out of a photo, through the real route and the real Workers AI call shape. Cloudflare is replaced by
// a fake fetch: what is being checked is the request we send, what we make of the answer, and that nothing is saved.
vi.hoisted(() => {
  process.env.GCS_PUBLIC_BUCKET_NAME = "test-public";
  process.env.GCS_PRIVATE_BUCKET_NAME = "test-private";
});

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenkitchen.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xenkitchen${url}`).set(as(who)),
  post: (url: string) => request(t.app).post(`/api/xenkitchen${url}`).set(as(who)),
  items: () => request(t.app).get("/api/xenkitchen/items").set(as(who)),
});

/** A real (tiny) PNG, so sharp has something to read. */
const photo = () =>
  sharp({ create: { width: 40, height: 60, channels: 3, background: "#ffffff" } })
    .png()
    .toBuffer();

const OCR_TEXT = "Grandma's pancakes\n2 cups flour\n1 tsp salt\n2 eggs\nMix it all. Fry in butter.";
const STRUCTURED = {
  title: "Grandma's pancakes",
  description: "",
  servings: "4",
  prep_minutes: "10",
  cook_minutes: "15",
  ingredient_lines: ["2 cups flour", "1 tsp salt", "2 eggs"],
  steps: ["Mix it all.", "Fry in butter."],
  tags: ["breakfast"],
};

interface Call {
  model: string;
  body: any;
}

/** Answer the model calls; `answer` decides what each returns. */
function fakeCloudflare(answer: (call: Call, index: number) => { status?: number; result?: unknown }) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const model = href.split("/ai/run/")[1] ?? href;
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ model, body });
    const reply = answer({ model, body }, calls.length - 1);
    if (reply.status) return new Response("{}", { status: reply.status });
    return new Response(JSON.stringify({ result: reply.result, success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  process.env.CLOUDFLARE_AI_ACCOUNT_ID = "test-account";
  process.env.CLOUDFLARE_AI_TOKEN = "test-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_AI_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_AI_TOKEN;
  delete process.env.CLOUDFLARE_AI_VISION_MODEL;
});

describe("reading a recipe from a photo", () => {
  it("asks for the fields in one call, with the picture as an image part, and saves nothing", async () => {
    const me = await createUser();
    const calls = fakeCloudflare(() => ({ result: { response: STRUCTURED } }));

    const res = await api(me)
      .post("/import-photo")
      .attach("image", await photo(), { filename: "card.png", contentType: "image/png" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const recipe = res.body.data.recipe;
    expect(recipe).toMatchObject({
      title: "Grandma's pancakes",
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 15,
      source_url: "",
    });
    // The ingredient lines went through the same parser a pasted list uses.
    expect(recipe.ingredients.map((i: any) => [i.quantity, i.unit, i.name])).toEqual([
      ["2", "cups", "flour"],
      ["1", "tsp", "salt"],
      ["2", "", "eggs"],
    ]);
    expect(recipe.steps).toEqual([
      { text: "Mix it all.", timer_minutes: null },
      { text: "Fry in butter.", timer_minutes: null },
    ]);
    expect(recipe.tags).toEqual(["breakfast"]);

    // One call, to the vision model, carrying the schema and a downscaled WebP data URI.
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    expect(calls[0].body.guided_json.properties.ingredient_lines.type).toBe("array");
    const parts = calls[0].body.messages[0].content;
    expect(parts[0].type).toBe("text");
    expect(parts[1].type).toBe("image_url");
    expect(parts[1].image_url.url.startsWith("data:image/webp;base64,")).toBe(true);

    // Nothing was written: the caller still has no recipes.
    expect((await api(me).items()).body.data.items).toHaveLength(0);
  });

  it("understands the answer when the model returns it as chat-completion text", async () => {
    const me = await createUser();
    fakeCloudflare(() => ({
      result: { choices: [{ message: { role: "assistant", content: JSON.stringify(STRUCTURED) } }] },
    }));

    const res = await api(me)
      .post("/import-photo")
      .attach("image", await photo(), { filename: "card.png", contentType: "image/png" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.recipe.ingredients).toHaveLength(3);
  });

  it("falls back to the words when the answer isn't the shape that was asked for", async () => {
    const me = await createUser();
    // The first call answers prose; the second (the plain read) answers the transcription.
    fakeCloudflare((_call, index) =>
      index === 0 ? { result: { response: "I'm sorry, I can't help with that." } } : { result: { response: OCR_TEXT } },
    );

    const res = await api(me)
      .post("/import-photo")
      .attach("image", await photo(), { filename: "card.png", contentType: "image/png" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // The transcription becomes the recipe's steps rather than the scan being lost.
    expect(res.body.data.recipe.title).toBe("Grandma's pancakes");
    expect(res.body.data.recipe.steps.map((s: any) => s.text)).toContain("2 cups flour");
  });

  it("says so when nothing was set up on the server", async () => {
    delete process.env.CLOUDFLARE_AI_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_TOKEN;
    const me = await createUser();

    expect((await api(me).get("/status")).body.data.photo_import).toBe(false);
    const res = await api(me)
      .post("/import-photo")
      .attach("image", await photo(), { filename: "card.png", contentType: "image/png" });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/isn't set up/);
  });

  it("reports that it is available once credentials are set", async () => {
    const me = await createUser();
    expect((await api(me).get("/status")).body.data.photo_import).toBe(true);
  });

  it("uses the model named in the environment", async () => {
    process.env.CLOUDFLARE_AI_VISION_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";
    const me = await createUser();
    const calls = fakeCloudflare(() => ({ result: { response: STRUCTURED } }));

    await api(me)
      .post("/import-photo")
      .attach("image", await photo(), { filename: "card.png", contentType: "image/png" });
    expect(calls[0].model).toBe("@cf/mistralai/mistral-small-3.1-24b-instruct");
  });

  it("passes on a provider failure as a retryable message, not a stack", async () => {
    const me = await createUser();
    fakeCloudflare(() => ({ status: 500 }));

    const res = await api(me)
      .post("/import-photo")
      .attach("image", await photo(), { filename: "card.png", contentType: "image/png" });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/try again/i);
  });

  it("refuses a request with no photo, and something that isn't a picture", async () => {
    const me = await createUser();
    expect((await api(me).post("/import-photo")).status).toBe(400);
    const notAnImage = await api(me)
      .post("/import-photo")
      .attach("image", Buffer.from("not a picture"), { filename: "notes.txt", contentType: "text/plain" });
    expect(notAnImage.status).toBeGreaterThanOrEqual(400);
  });

  it("is limited per person, because each photo costs money at the other end", async () => {
    const me = await createUser();
    fakeCloudflare(() => ({ result: { response: STRUCTURED } }));
    const image = await photo();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await api(me)
        .post("/import-photo")
        .attach("image", image, { filename: "card.png", contentType: "image/png" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(statuses[6]).toBe(429);
  });
});
