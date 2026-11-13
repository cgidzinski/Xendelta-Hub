import { describe, it, expect } from "vitest";
import {
  applyKitchenFilters,
  collectTags,
  type CategoryLike,
  type BookLike,
  canEdit,
  canManage,
  canView,
  changeRole,
  pickTargetCategory,
  removeMember,
  roleIn,
  generateShareToken,
  itemFieldsFromBody,
  SHARE_TOKEN_PATTERN,
  serializeItem,
  suggestIngredients,
} from "./xenKitchen";
import { EMPTY_FILTERS } from "@shared/xenkitchen/kitchen";

const dinner = { _id: "c1", layout: "recipe" as const, name: "Dinner", color: "#e57373", icon: "dinner" };
const frozen = { _id: "c2", layout: "instructions" as const, name: "Frozen", color: "#7986cb", icon: "frozen" };
const cats = new Map<string, CategoryLike>([
  ["c1", dinner],
  ["c2", frozen],
]);

const items = [
  {
    _id: "i1",
    title: "Chicken curry",
    category_id: "c1",
    tags: ["spicy"],
    favorited_by: ["me"],
    prep_minutes: 15,
    cook_minutes: 30,
    updated_at: "2026-01-03",
    created_at: "2026-01-01",
    ingredients: [
      { name: "Chicken thighs", name_key: "chicken thighs", unit: "lb" },
      { name: "Garlic", name_key: "garlic", unit: "cloves" },
    ],
  },
  {
    _id: "i2",
    title: "Frozen pizza",
    category_id: "c2",
    brand: "Acme",
    tags: [],
    updated_at: "2026-01-05",
    created_at: "2026-01-04",
    methods: [{ method: "oven", minutes_min: 12, minutes_max: 15 }],
  },
  {
    _id: "i3",
    title: "Garlic bread",
    category_id: null,
    tags: ["spicy", "quick"],
    updated_at: "2026-01-01",
    created_at: "2026-01-02",
    prep_minutes: 5,
    cook_minutes: 5,
    ingredients: [
      { name: "garlic", name_key: "garlic", unit: "clove" },
      { name: "Bread", unit: "" },
    ],
  },
];

const ids = (list: any[]) => list.map((i) => i._id);

describe("generateShareToken", () => {
  it("is 22 url-safe characters and unique", () => {
    const a = generateShareToken();
    expect(a).toMatch(SHARE_TOKEN_PATTERN);
    expect(a).not.toBe(generateShareToken());
  });
});

describe("applyKitchenFilters", () => {
  it("defaults to most recently updated first", () => {
    expect(ids(applyKitchenFilters(items, EMPTY_FILTERS, cats))).toEqual(["i2", "i1", "i3"]);
  });
  it("filters by category and uncategorised", () => {
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, category: "c2" }, cats))).toEqual(["i2"]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, category: "none" }, cats))).toEqual(["i3"]);
  });
  it("filters recipes vs instructions by the category's layout", () => {
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, layout: "instructions" }, cats))).toEqual(["i2"]);
    // Uncategorised items count as recipes.
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, layout: "recipe" }, cats))).toEqual(["i1", "i3"]);
  });
  it("treats an item whose category was deleted as uncategorised", () => {
    const orphan = { ...items[0], _id: "i4", category_id: "gone" };
    expect(ids(applyKitchenFilters([orphan], { ...EMPTY_FILTERS, category: "none" }, cats))).toEqual(["i4"]);
  });
  it("requires every tag and ingredient", () => {
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, tags: ["spicy", "quick"] }, cats))).toEqual(["i3"]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, ingredients: ["Garlic"] }, cats))).toEqual(["i1", "i3"]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, ingredients: ["garlic", "bread"] }, cats))).toEqual([
      "i3",
    ]);
  });
  it("searches title, brand, tags and ingredient names", () => {
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, q: "acme" }, cats))).toEqual(["i2"]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, q: "thighs" }, cats))).toEqual(["i1"]);
  });
  it("filters by method, favorite and time, and sorts by time", () => {
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, method: "oven" }, cats))).toEqual(["i2"]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, favorite: true }, cats, "me"))).toEqual(["i1"]);
    // Someone else's star doesn't count as mine.
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, favorite: true }, cats, "you"))).toEqual([]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, maxMinutes: 15 }, cats))).toEqual(["i2", "i3"]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, sort: "time" }, cats))).toEqual(["i3", "i2", "i1"]);
    expect(ids(applyKitchenFilters(items, { ...EMPTY_FILTERS, sort: "title" }, cats))).toEqual(["i1", "i2", "i3"]);
  });
});

describe("suggestIngredients", () => {
  it("groups case-insensitively, most used first, with the usual unit", () => {
    const s = suggestIngredients(items, "");
    expect(s[0]).toMatchObject({ count: 2 });
    expect(s[0].name.toLowerCase()).toBe("garlic");
    expect(s.map((x) => x.name.toLowerCase())).toEqual(["garlic", "bread", "chicken thighs"]);
  });
  it("matches the query and ranks prefix matches first", () => {
    const more = [
      ...items,
      {
        ingredients: [
          { name: "Thai basil", unit: "" },
          { name: "Basil", unit: "" },
        ],
      },
    ];
    expect(suggestIngredients(more, "bas").map((x) => x.name)).toEqual(["Basil", "Thai basil"]);
    expect(suggestIngredients(items, "zzz")).toEqual([]);
  });
});

describe("collectTags", () => {
  it("counts tags", () => {
    expect(collectTags(items)).toEqual([
      { tag: "spicy", count: 2 },
      { tag: "quick", count: 1 },
    ]);
  });
});

describe("itemFieldsFromBody", () => {
  it("only returns keys that were sent", () => {
    expect(itemFieldsFromBody({ title: " Soup " })).toEqual({ title: "Soup" });
  });
  it("normalises tags, drops empty rows and adds ingredient keys", () => {
    const out: any = itemFieldsFromBody({
      tags: ["Quick ", "quick", ""],
      ingredients: [
        { name: " Olive Oil ", quantity: "2", unit: "tbsp" },
        { name: "", quantity: "" },
      ],
      steps: [{ text: "Stir" }, { text: "  " }],
      methods: [{ method: "oven", temp: 425, minutes_min: 18, minutes_max: 20, steps: ["", "Remove film"] }],
    });
    expect(out.tags).toEqual(["quick"]);
    expect(out.ingredients).toEqual([
      { name: "Olive Oil", name_key: "olive oil", quantity: "2", unit: "tbsp", note: "", section: "" },
    ]);
    expect(out.steps).toEqual([{ text: "Stir", timer_minutes: null }]);
    expect(out.methods[0]).toMatchObject({
      method: "oven",
      temp: 425,
      temp_unit: "F",
      preheat: false,
      steps: ["Remove film"],
    });
  });
  it("clears the category with an empty string", () => {
    expect(itemFieldsFromBody({ category_id: "" })).toEqual({ category_id: null });
  });
});

describe("serializeItem", () => {
  const raw = {
    ...items[1],
    _id: "i2",
    book_id: "b1",
    created_by: "u1",
    favorited_by: ["u1"],
    share: { enabled: true, token: "t".repeat(22) },
    images: [{ _id: "m1", url: "u", gcs_path: "p" }],
  };
  it("carries the category layout and hides storage paths", () => {
    const books = new Map<string, BookLike>([
      [
        "b1",
        {
          _id: "b1",
          name: "Home",
          members: [
            { user_id: "u1", role: "owner" },
            { user_id: "u2", role: "viewer" },
          ],
        },
      ],
    ]);
    const s: any = serializeItem(raw, cats, { uid: "u1", books, usernames: new Map([["u1", "ann"]]) });
    expect(s.layout).toBe("instructions");
    expect(s.favorite).toBe(true);
    expect(s.book).toEqual({ _id: "b1", name: "Home" });
    expect(s.my_role).toBe("owner");
    expect(s.created_by).toBe("ann");
    const other: any = serializeItem(raw, cats, { uid: "u2", books });
    expect(other.favorite).toBe(false);
    expect(other.my_role).toBe("viewer");
    expect(s.category.name).toBe("Frozen");
    expect(s.images).toEqual([{ _id: "m1", url: "u" }]);
    expect(s.share.token).toBe("t".repeat(22));
  });
  it("strips owner-only fields for the public view", () => {
    const s: any = serializeItem(raw, cats, { isPublic: true });
    expect(s.share).toBeUndefined();
    expect(s.favorite).toBeUndefined();
    expect(s.created_by).toBeUndefined();
    expect(s.book).toBeUndefined();
  });
  it("hides the token while sharing is off", () => {
    const s: any = serializeItem({ ...raw, share: { enabled: false, token: "x".repeat(22) } }, cats);
    expect(s.share).toEqual({ enabled: false, token: null });
  });
});

import { buildKitchenMetaTags, createKitchenHtmlTransformer, XENKITCHEN_SHARE_PATH } from "./xenKitchenOgMeta";

describe("XenKitchen link previews", () => {
  const SHELL = "<html><head><title>XenSuite</title></head><body></body></html>";
  const req = (path: string) => ({ path, protocol: "https", get: () => "hub.test" }) as any;

  it("matches only share tokens", () => {
    expect(XENKITCHEN_SHARE_PATH.test("/k/" + "a".repeat(22))).toBe(true);
    expect(XENKITCHEN_SHARE_PATH.test("/k/short")).toBe(false);
    expect(XENKITCHEN_SHARE_PATH.test("/internal/xenkitchen")).toBe(false);
  });

  it("escapes titles and includes the cover image", () => {
    const tags = buildKitchenMetaTags(
      { title: 'Mom"s <pie>', images: [{ url: "https://img/x.webp" }] },
      "https://hub.test/k/x",
    );
    expect(tags).toContain("Mom&quot;s &lt;pie&gt;");
    expect(tags).toContain('og:image" content="https://img/x.webp"');
  });

  it("injects tags for a shared item and passes everything else through", async () => {
    const t = createKitchenHtmlTransformer(async (token) => (token === "a".repeat(22) ? { title: "Soup" } : null));
    expect(await t(SHELL, req("/k/" + "a".repeat(22)))).toContain('og:title" content="Soup"');
    expect(await t(SHELL, req("/k/" + "b".repeat(22)))).toBe(SHELL);
    expect(await t(SHELL, req("/"))).toBe(SHELL);
  });
});

describe("book roles", () => {
  const book: BookLike = {
    _id: "b",
    members: [
      { user_id: "own", role: "owner" },
      { user_id: "ed", role: "editor" },
      { user_id: "vw", role: "viewer" },
    ],
  };
  it("grants view/edit/manage by role", () => {
    expect([canView(book, "vw"), canEdit(book, "vw"), canManage(book, "vw")]).toEqual([true, false, false]);
    expect([canView(book, "ed"), canEdit(book, "ed"), canManage(book, "ed")]).toEqual([true, true, false]);
    expect([canView(book, "own"), canEdit(book, "own"), canManage(book, "own")]).toEqual([true, true, true]);
    expect([canView(book, "x"), roleIn(book, "x")]).toEqual([false, null]);
  });
  it("only the owner changes roles, and handing over keeps one owner", () => {
    expect(changeRole(book, "ed", "vw", "editor")).toMatchObject({ ok: false, code: 403 });
    const r = changeRole(book, "own", "ed", "owner");
    expect(r.ok && r.members.filter((m) => m.role === "owner").map((m) => m.user_id)).toEqual(["ed"]);
    expect(r.ok && r.members.find((m) => m.user_id === "own")?.role).toBe("editor");
    expect(changeRole(book, "own", "own", "viewer")).toMatchObject({ ok: false, code: 400 });
    expect(changeRole(book, "own", "nobody", "viewer")).toMatchObject({ ok: false, code: 404 });
  });
  it("lets people leave, the owner remove anyone, and never removes the owner", () => {
    expect(removeMember(book, "vw", "vw").ok).toBe(true);
    expect(removeMember(book, "ed", "vw")).toMatchObject({ ok: false, code: 403 });
    expect(removeMember(book, "own", "ed").ok).toBe(true);
    expect(removeMember(book, "own", "own")).toMatchObject({ ok: false, code: 400 });
    expect(removeMember(book, "stranger", "vw")).toMatchObject({ ok: false, code: 404 });
  });
});

describe("pickTargetCategory", () => {
  const target: CategoryLike[] = [
    { _id: "t1", name: "Dinner", layout: "recipe" },
    { _id: "t2", name: "Instructions", layout: "instructions" },
    { _id: "t3", name: "Mains", layout: "recipe" },
  ];
  it("prefers an explicit category of the target book", () => {
    expect(pickTargetCategory(target, dinner, "t3")).toBe("t3");
    expect(pickTargetCategory(target, dinner, "elsewhere")).toBeNull();
  });
  it("matches by name, then by layout", () => {
    expect(pickTargetCategory(target, { _id: "x", name: "dinner", layout: "recipe" })).toBe("t1");
    expect(pickTargetCategory(target, frozen)).toBe("t2");
    expect(pickTargetCategory(target, undefined)).toBeNull();
  });
});
