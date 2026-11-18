import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { createAppTheme } from "../../../../theme";
import type { KitchenItem } from "../../../../hooks/xenkitchen/useKitchen";
import BookPrintView from "./BookPrintView";
import { buildCookbook, DEFAULT_COOKBOOK_OPTIONS } from "./cookbook";

const dinners = { _id: "d", name: "Dinners", color: "", icon: "restaurant", layout: "recipe" as const };
const item = (title: string, over: Partial<KitchenItem> = {}) =>
  ({
    _id: title,
    title,
    description: "",
    category: dinners,
    layout: "recipe",
    favorite: false,
    notes: "",
    brand: "",
    storage_note: "",
    images: [{ _id: "i", url: "https://example.test/photo.webp" }],
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 25,
    source_url: "",
    ingredients: [
      { name: "flour", quantity: "200", unit: "g", note: "", section: "Batter" },
      { name: "butter", quantity: "30", unit: "g", note: "melted", section: "Serving" },
    ],
    steps: [{ text: "Whisk it.", timer_minutes: null }],
    methods: [],
    ...over,
  }) as unknown as KitchenItem;

const book = { name: "Home", description: "Weeknights.", icon: "restaurant", color: "#ff8a65", cover_url: null };
const render = (photos: boolean, items: KitchenItem[]) =>
  renderToStaticMarkup(
    <ThemeProvider theme={createAppTheme("light")}>
      <BookPrintView
        book={book}
        owner="Alex"
        sections={buildCookbook(items, [dinners], DEFAULT_COOKBOOK_OPTIONS)}
        photos={photos}
      />
    </ThemeProvider>,
  );

describe("the cookbook pages", () => {
  const html = render(true, [item("Curry"), item("Chilli")]);

  it("has a cover with the book's name, count and who it's from", () => {
    expect(html).toContain("Home");
    expect(html).toContain("2 recipes");
    expect(html).toContain("from Alex");
  });

  it("lists every recipe in the contents and gives each its own page", () => {
    expect(html).toContain("Contents");
    expect((html.match(/<article/g) ?? []).length).toBe(2);
    expect(html).toContain("Chilli");
    expect(html).toContain("Curry");
  });

  it("shows facts, ingredients under their sections, and numbered steps", () => {
    expect(html).toContain("Serves 4 · Prep 10 min · Cook 25 min");
    expect(html).toContain("Batter");
    expect(html).toContain("200 g flour");
    expect(html).toContain("30 g butter, melted");
    expect(html).toContain("Whisk it.");
  });

  it("includes photos only when asked", () => {
    expect(html).toContain("https://example.test/photo.webp");
    expect(render(false, [item("Curry")])).not.toContain("https://example.test/photo.webp");
  });
});
