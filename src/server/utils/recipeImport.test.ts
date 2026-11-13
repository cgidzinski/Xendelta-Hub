import { describe, it, expect } from "vitest";
import { durationMinutes, extractRecipe, servingsFrom } from "./recipeImport";

const PAGE = "https://food.example.com/recipes/pancakes";
const page = (...blocks: unknown[]) =>
  `<html><head><title>x</title>${blocks
    // A real page can't contain "</script>" inside a script block, so it is written as "<\/", which is the same JSON string.
    .map(
      (b) =>
        `<script type="application/ld+json">${(typeof b === "string" ? b : JSON.stringify(b)).replaceAll("</", "<\\/")}</script>`,
    )
    .join("\n")}</head><body>hi</body></html>`;

const pancakes = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Fluffy Pancakes",
  description: "The <b>best</b> pancakes &amp; syrup.",
  image: ["https://cdn.example.com/p/pancakes.jpg", "https://cdn.example.com/p/other.jpg"],
  recipeYield: ["4", "4 servings"],
  prepTime: "PT10M",
  cookTime: "PT1H5M",
  recipeCategory: "Breakfast",
  recipeCuisine: ["American"],
  keywords: "pancakes, Brunch, quick,  pancakes",
  recipeIngredient: ["1 1/2 cups all-purpose flour", "2 tbsp sugar", "1 egg, beaten", "Pinch of salt"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Mix the dry ingredients." },
    { "@type": "HowToStep", text: "Whisk in the milk &amp; egg." },
    { "@type": "HowToStep", name: "Cook", text: "" },
  ],
};

describe("extractRecipe", () => {
  it("reads a typical recipe", () => {
    const r = extractRecipe(page(pancakes), PAGE)!;
    expect(r.title).toBe("Fluffy Pancakes");
    expect(r.description).toBe("The best pancakes & syrup.");
    expect(r.servings).toBe(4);
    expect(r.prep_minutes).toBe(10);
    expect(r.cook_minutes).toBe(65);
    expect(r.tags).toEqual(["breakfast", "american", "pancakes", "brunch", "quick"]);
    expect(r.image_url).toBe("https://cdn.example.com/p/pancakes.jpg");
    expect(r.source_url).toBe(PAGE);
    expect(r.ingredients).toEqual([
      { quantity: "1 1/2", unit: "cups", name: "all-purpose flour", note: "", section: "" },
      { quantity: "2", unit: "tbsp", name: "sugar", note: "", section: "" },
      { quantity: "1", unit: "", name: "egg", note: "beaten", section: "" },
      { quantity: "", unit: "Pinch", name: "salt", note: "", section: "" },
    ]);
    // the third step has no text, so the step's name is used
    expect(r.steps.map((s) => s.text)).toEqual(["Mix the dry ingredients.", "Whisk in the milk & egg.", "Cook"]);
  });

  it("finds the recipe inside a @graph, a list, or after other JSON-LD", () => {
    const org = { "@type": "Organization", name: "Food Co" };
    expect(
      extractRecipe(page({ "@context": "https://schema.org", "@graph": [org, { "@type": "WebPage" }, pancakes] }), PAGE)
        ?.title,
    ).toBe("Fluffy Pancakes");
    expect(extractRecipe(page([org, pancakes]), PAGE)?.title).toBe("Fluffy Pancakes");
    expect(extractRecipe(page(org, pancakes), PAGE)?.title).toBe("Fluffy Pancakes");
    expect(
      extractRecipe(page({ "@type": ["Recipe", "Thing"], name: "Dual", recipeIngredient: ["1 egg"] }), PAGE)?.title,
    ).toBe("Dual");
    expect(
      extractRecipe(
        page({ "@type": "https://schema.org/Recipe", name: "Full URL type", recipeIngredient: ["1 egg"] }),
        PAGE,
      )?.title,
    ).toBe("Full URL type");
  });

  it("skips JSON-LD that is broken, and tolerates comment and CDATA wrappers", () => {
    expect(extractRecipe(page("{ not json", pancakes), PAGE)?.title).toBe("Fluffy Pancakes");
    expect(extractRecipe(page("<!-- " + JSON.stringify(pancakes) + " -->"), PAGE)?.title).toBe("Fluffy Pancakes");
    expect(extractRecipe(page("//<![CDATA[\n" + JSON.stringify(pancakes) + "\n//]]>"), PAGE)?.title).toBe(
      "Fluffy Pancakes",
    );
  });

  it("gives nothing for a page without a recipe", () => {
    expect(extractRecipe("<html><body>No data here</body></html>", PAGE)).toBeNull();
    expect(extractRecipe(page({ "@type": "Article", name: "A blog post" }), PAGE)).toBeNull();
    expect(extractRecipe(page({ "@type": "Recipe", name: "Hollow" }), PAGE)).toBeNull(); // nothing to cook with
    expect(extractRecipe(page({ "@type": "Recipe", recipeIngredient: ["1 egg"] }), PAGE)).toBeNull(); // no name
    expect(extractRecipe("", PAGE)).toBeNull();
  });

  it("reads instructions as text, as a list, or in sections", () => {
    const base = { "@type": "Recipe", name: "R", recipeIngredient: ["1 egg"] };
    const steps = (recipeInstructions: unknown) =>
      extractRecipe(page({ ...base, recipeInstructions }), PAGE)!.steps.map((s) => s.text);
    expect(steps("Beat the egg.\nFry it.\n\nServe.")).toEqual(["Beat the egg.", "Fry it.", "Serve."]);
    expect(steps("<ol><li>Beat the egg.</li><li>Fry it.</li></ol>")).toEqual(["Beat the egg.", "Fry it."]);
    expect(steps(["Beat.", "Fry."])).toEqual(["Beat.", "Fry."]);
    expect(
      steps([
        {
          "@type": "HowToSection",
          name: "Batter",
          itemListElement: [
            { "@type": "HowToStep", text: "Beat." },
            { "@type": "HowToStep", text: "Rest." },
          ],
        },
        { "@type": "HowToSection", name: "Cook", itemListElement: [{ "@type": "HowToStep", text: "Fry." }] },
      ]),
    ).toEqual(["Beat.", "Rest.", "Fry."]);
  });

  it("makes picture addresses absolute, and refuses ones that aren't web addresses", () => {
    const img = (image: unknown) => extractRecipe(page({ ...pancakes, image }), PAGE)!.image_url;
    expect(img("/img/a.jpg")).toBe("https://food.example.com/img/a.jpg");
    expect(img({ "@type": "ImageObject", url: "https://cdn.example.com/b.png" })).toBe("https://cdn.example.com/b.png");
    expect(img(["javascript:alert(1)", "data:image/png;base64,AAAA", "https://cdn.example.com/c.png"])).toBe(
      "https://cdn.example.com/c.png",
    );
    expect(img("javascript:alert(1)")).toBeNull();
    expect(img(undefined)).toBeNull();
  });

  it("keeps everything inside what an item accepts", () => {
    const r = extractRecipe(
      page({
        "@type": "Recipe",
        name: "N".repeat(500),
        description: "d".repeat(5000),
        recipeIngredient: Array.from({ length: 300 }, (_, i) => `${i + 1} cups ${"flour".repeat(60)}`),
        recipeInstructions: Array.from({ length: 300 }, (_, i) => "s".repeat(3000) + i),
        keywords: Array.from({ length: 50 }, (_, i) => `tag${i}-${"x".repeat(60)}`).join(","),
      }),
      PAGE + "?" + "q=".repeat(2000),
    )!;
    expect(r.title.length).toBeLessThanOrEqual(120);
    expect(r.description.length).toBeLessThanOrEqual(2000);
    expect(r.ingredients).toHaveLength(100);
    expect(r.ingredients.every((i) => i.name.length <= 120 && i.unit.length <= 30 && i.quantity.length <= 20)).toBe(
      true,
    );
    expect(r.steps).toHaveLength(100);
    expect(r.steps.every((s) => s.text.length <= 2000)).toBe(true);
    expect(r.tags).toHaveLength(20);
    expect(r.tags.every((t) => t.length <= 30)).toBe(true);
    expect(r.source_url.length).toBeLessThanOrEqual(2000);
  });

  it("never returns markup or script from a hostile page", () => {
    const r = extractRecipe(
      page({
        "@type": "Recipe",
        name: "<img src=x onerror=alert(1)>Soup",
        description: "<script>alert(1)</script>tasty",
        recipeIngredient: ["1 <b>onion</b>", "<a href='javascript:x'>2 carrots</a>"],
        recipeInstructions: ["<p>Chop</p><script>steal()</script>"],
      }),
      PAGE,
    )!;
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/<\/?(img|script|a|b|p)\b/i);
    expect(r.title).toBe("Soup");
    expect(r.ingredients.map((i) => i.name)).toEqual(["onion", "carrots"]);
  });
});

describe("durationMinutes", () => {
  it("reads ISO 8601 durations", () => {
    expect(durationMinutes("PT45M")).toBe(45);
    expect(durationMinutes("PT1H30M")).toBe(90);
    expect(durationMinutes("P0DT2H")).toBe(120);
    expect(durationMinutes("P1DT1H")).toBe(1500);
    expect(durationMinutes("PT90S")).toBe(2);
    expect(durationMinutes("pt20m")).toBe(20);
  });
  it("gives null for anything else, zero, or too long", () => {
    for (const v of ["", "45", "PT", "P", "PTM", "soon", "PT0M", "P30D", null, undefined, 45, "1 hour"])
      expect(durationMinutes(v), String(v)).toBeNull();
  });
});

describe("servingsFrom", () => {
  it("takes the first number", () => {
    expect(servingsFrom("4")).toBe(4);
    expect(servingsFrom(6)).toBe(6);
    expect(servingsFrom("Makes 12 cookies")).toBe(12);
    expect(servingsFrom(["8 servings", "8"])).toBe(8);
    expect(servingsFrom("2.5")).toBe(2.5);
  });
  it("gives null when there isn't one or it's absurd", () => {
    for (const v of ["", "a crowd", [], null, undefined, 0, "0", "5000"]) expect(servingsFrom(v), String(v)).toBeNull();
  });
});
