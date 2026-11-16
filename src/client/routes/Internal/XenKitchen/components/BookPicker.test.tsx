import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppTheme } from "../../../../theme";
import type { KitchenBook } from "../../../../hooks/xenkitchen/useKitchen";
import { BookPickerButton, BookStrip } from "./BookPicker";
import BookCover from "./BookCover";

const book = (over: Partial<KitchenBook>): KitchenBook => ({
  _id: "b1",
  name: "Home",
  description: "",
  icon: "restaurant",
  color: "#ff8a65",
  cover_url: null,
  cover_thumb_url: null,
  my_role: "owner",
  item_count: 3,
  members: [],
  share: { enabled: false, token: null },
  ...over,
});

const books = [
  book({ _id: "b1", name: "Home", cover_url: "https://example.test/cover.webp" }),
  book({ _id: "b2", name: "Baking" }),
];

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={createAppTheme("light")}>{node}</ThemeProvider>
    </QueryClientProvider>,
  );

// The picker is hidden until the page title is clicked; then it is one row of square covers with the names under them.
describe("the recipe book picker", () => {
  it("shows nothing but the title while it is closed", () => {
    const html = render(
      <>
        <BookPickerButton books={books} value="b1" open={false} onToggle={() => {}} />
        <BookStrip books={books} value="b1" open={false} onChange={() => {}} onClose={() => {}} />
      </>,
    );
    expect(html).toContain("Home");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Baking");
    expect(html).not.toContain("New book");
  });

  it("lists All recipes, every book and New book when open, and marks the current book", () => {
    const html = render(<BookStrip books={books} value="b2" open onChange={() => {}} onClose={() => {}} />);
    const order = ["All recipes", "Home", "Baking", "New book"].map((label) => html.indexOf(label));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("https://example.test/cover.webp");
    // Only the current book is marked.
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it("names the page All recipes when no book is chosen", () => {
    const html = render(<BookPickerButton books={books} value="all" open onToggle={() => {}} />);
    expect(html).toContain("All recipes");
    expect(html).toContain('aria-expanded="true"');
  });
});

describe("a book cover", () => {
  it("is the picture when there is one", () => {
    expect(render(<BookCover book={books[0]} size={72} />)).toContain("<img");
  });

  it("is a tinted square with the book's icon when there is no picture", () => {
    const html = render(<BookCover book={books[1]} size={72} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  });
});
