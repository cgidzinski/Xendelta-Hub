import { describe, it, expect } from "vitest";
import {
  EMOJI_GROUPS,
  buildEntries,
  isSkinTone,
  recordRecent,
  searchEmoji,
  withTone,
  type EmojiEntry,
} from "./emojiData";

const raw = [
  { hexcode: "1F600", label: "grinning face", unicode: "😀", group: 0, order: 1, tags: ["face", "grin"] },
  {
    hexcode: "1F44B",
    label: "waving hand",
    unicode: "👋",
    group: 1,
    order: 189,
    tags: ["hello", "wave", "hi"],
    skins: ["a", "b", "c", "d", "e"].map((x) => ({ unicode: `👋${x}` })),
  },
  {
    hexcode: "1F491",
    label: "couple with heart",
    unicode: "💑",
    group: 1,
    order: 500,
    tags: ["couple"],
    skins: Array.from({ length: 25 }, (_, i) => ({ unicode: `x${i}` })),
  },
  { hexcode: "1F3FB", label: "light skin tone", unicode: "🏻", group: 2, order: 800 },
  { hexcode: "1F1E6", label: "regional indicator A", unicode: "🇦" },
  {
    hexcode: "1F602",
    label: "face with tears of joy",
    unicode: "😂",
    group: 0,
    order: 4,
    tags: ["laugh", "lol", "tears"],
  },
];
const entries = buildEntries(raw, { "1F600": ["grinning", "grin"], "1F602": "joy" });

describe("building the emoji list", () => {
  it("leaves out skin-tone swatches and records with no group, and sorts by order", () => {
    expect(entries.map((e) => e.emoji)).toEqual(["😀", "😂", "👋", "💑"]);
  });
  it("keeps five-tone skins, and drops the 25-variant ones for couples", () => {
    expect(entries.find((e) => e.emoji === "👋")!.skins).toHaveLength(5);
    expect(entries.find((e) => e.emoji === "💑")!.skins).toEqual([]);
  });
  it("attaches the first shortcode", () => {
    expect(entries.find((e) => e.emoji === "😀")!.shortcode).toBe("grinning");
    expect(entries.find((e) => e.emoji === "😂")!.shortcode).toBe("joy");
  });
  it("groups never include the swatch group", () => {
    expect(EMOJI_GROUPS.map((g) => g.id)).not.toContain(2);
  });
});

describe("skin tones", () => {
  const wave = entries.find((e) => e.emoji === "👋")!;
  it("tone 0 is the default, 1 to 5 pick a variant", () => {
    expect(withTone(wave, 0)).toBe("👋");
    expect(withTone(wave, 1)).toBe("👋a");
    expect(withTone(wave, 5)).toBe("👋e");
  });
  it("an emoji with no tones stays as it is", () => {
    expect(withTone(entries[0]!, 3)).toBe("😀");
  });
  it("accepts only 0 to 5", () => {
    expect([0, 3, 5].every(isSkinTone)).toBe(true);
    expect([6, -1, "1", null].some(isSkinTone)).toBe(false);
  });
});

describe("searchEmoji", () => {
  const find = (q: string): string[] => searchEmoji(entries as EmojiEntry[], q).map((e) => e.emoji);
  it("finds by label, tag and shortcode", () => {
    expect(find("grinning")).toEqual(["😀"]);
    expect(find("lol")).toEqual(["😂"]);
    expect(find("joy")).toEqual(["😂"]);
    expect(find("hello")).toEqual(["👋"]);
  });
  it("puts a label that starts with the search above one that only contains it", () => {
    expect(find("face")).toEqual(["😂", "😀"]);
    expect(find("tears")[0]).toBe("😂");
  });
  it("is case-insensitive and ignores surrounding space", () => {
    expect(find("  WAVE ")).toEqual(["👋"]);
  });
  it("finds nothing for an empty or unknown search", () => {
    expect(find("")).toEqual([]);
    expect(find("zzzz")).toEqual([]);
  });
  it("limits the number of results", () => {
    expect(searchEmoji(entries, "a", 1)).toHaveLength(1);
  });
});

describe("recordRecent", () => {
  it("puts the newest first and doesn't repeat", () => {
    expect(recordRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(recordRecent([], "a")).toEqual(["a"]);
  });
  it("keeps the list short", () => {
    expect(recordRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
