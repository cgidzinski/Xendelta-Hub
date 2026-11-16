import { Box, GlobalStyles, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { COOK_METHOD_LABELS, formatMinuteRange, formatMinutes } from "@shared/xenkitchen/kitchen";
import type { KitchenIngredient, KitchenItem, KitchenMethod } from "../../../../hooks/xenkitchen/useKitchen";
import BookCover, { type BookCoverBook } from "./BookCover";
import type { CookbookSection } from "./cookbook";

export interface CookbookBook extends BookCoverBook {
  name: string;
  description?: string;
}

interface Props {
  book: CookbookBook;
  /** Who the book is from, shown on the cover. */
  owner?: string | null;
  sections: CookbookSection[];
  photos: boolean;
}

/** The ingredients as one printed line: "2 cups flour, sifted". */
const ingredientText = (i: KitchenIngredient) =>
  [[i.quantity, i.unit].filter(Boolean).join(" "), i.name].filter(Boolean).join(" ") + (i.note ? `, ${i.note}` : "");

/** "Oven 180°C · preheat · 25–30 min". */
function methodLine(m: KitchenMethod): string {
  const parts = [
    COOK_METHOD_LABELS[m.method],
    m.temp ? `${m.temp}°${m.temp_unit}` : "",
    m.power,
    m.preheat ? "preheat" : "",
    formatMinuteRange(m.minutes_min, m.minutes_max),
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Ingredients in the order written, split under their section headings. */
function ingredientGroups(items: KitchenIngredient[]): Array<{ section: string; lines: string[] }> {
  const groups: Array<{ section: string; lines: string[] }> = [];
  for (const ing of items) {
    if (!ing.name && !ing.quantity) continue;
    const last = groups[groups.length - 1];
    if (last && last.section === (ing.section || "")) last.lines.push(ingredientText(ing));
    else groups.push({ section: ing.section || "", lines: [ingredientText(ing)] });
  }
  return groups;
}

const page = { breakBefore: "page" } as const;

function Recipe({ item, photos }: { item: KitchenItem; photos: boolean }) {
  const photo = photos ? item.images[0]?.url : undefined;
  const facts = [
    item.servings ? `Serves ${item.servings}` : "",
    item.prep_minutes ? `Prep ${formatMinutes(item.prep_minutes)}` : "",
    item.cook_minutes ? `Cook ${formatMinutes(item.cook_minutes)}` : "",
  ].filter(Boolean);
  const groups = ingredientGroups(item.ingredients);
  return (
    <Box component="article">
      <Typography component="h3" sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>
        {item.title || "Untitled"}
      </Typography>
      {item.brand && <Typography sx={{ color: "text.secondary", mt: 0.5 }}>{item.brand}</Typography>}
      {facts.length > 0 && (
        <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.5 }}>{facts.join(" · ")}</Typography>
      )}
      {photo && (
        <Box
          component="img"
          src={photo}
          alt=""
          sx={{ display: "block", width: "100%", maxHeight: "75mm", objectFit: "cover", borderRadius: 1, mt: 1.5 }}
        />
      )}
      {item.description && <Typography sx={{ mt: 1.5, fontSize: 14 }}>{item.description}</Typography>}

      {groups.length > 0 && (
        <Box sx={{ mt: 2, breakInside: "avoid" }}>
          <Typography component="h4" sx={{ fontWeight: 700, fontSize: 15, mb: 0.5 }}>
            Ingredients
          </Typography>
          {groups.map((g, gi) => (
            <Box key={gi} sx={{ mb: 1 }}>
              {g.section && <Typography sx={{ fontWeight: 600, fontSize: 13, mt: 0.5 }}>{g.section}</Typography>}
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 14, lineHeight: 1.6 }}>
                {g.lines.map((l, li) => (
                  <li key={li}>{l}</li>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {item.methods.length > 0 && (
        <Box sx={{ mt: 1.5, breakInside: "avoid" }}>
          <Typography component="h4" sx={{ fontWeight: 700, fontSize: 15, mb: 0.5 }}>
            {item.layout === "instructions" ? "Cooking" : "Cook it"}
          </Typography>
          {item.methods.map((m, mi) => (
            <Box key={mi} sx={{ mb: 0.75 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{methodLine(m)}</Typography>
              {m.steps.length > 0 && (
                <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: 14, lineHeight: 1.6 }}>
                  {m.steps.map((s, si) => (
                    <li key={si}>{s}</li>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {item.steps.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography component="h4" sx={{ fontWeight: 700, fontSize: 15, mb: 0.5 }}>
            Method
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: 14, lineHeight: 1.65 }}>
            {item.steps.map((s, si) => (
              <Box component="li" key={si} sx={{ breakInside: "avoid", mb: 0.5 }}>
                {s.text}
                {s.timer_minutes ? ` (${formatMinutes(s.timer_minutes)})` : ""}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {(item.notes || item.storage_note) && (
        <Box sx={{ mt: 1.5, fontSize: 13, color: "text.secondary", breakInside: "avoid" }}>
          {item.notes && <Typography sx={{ fontSize: 13 }}>{item.notes}</Typography>}
          {item.storage_note && <Typography sx={{ fontSize: 13 }}>Storage: {item.storage_note}</Typography>}
        </Box>
      )}
    </Box>
  );
}

/**
 * The whole book as printable pages: a cover, a contents, then for each category a title page followed by one page per
 * recipe. On screen it is a stack of white sheets; printed (or saved as a PDF from the print window) it is A4 with the book's
 * name and the page number in the footer.
 */
export default function BookPrintView({ book, owner, sections, photos }: Props) {
  const theme = useTheme();
  const count = sections.reduce((n, s) => n + s.items.length, 0);
  return (
    <Box
      sx={{
        bgcolor: "common.white",
        color: "common.black",
        maxWidth: 800,
        mx: "auto",
        p: { xs: 2, sm: 5 },
        "& h1, & h2, & h3, & h4": { m: 0 },
        "@media print": { maxWidth: "none", p: 0 },
      }}
    >
      <GlobalStyles
        styles={{
          "@page": {
            size: "A4",
            margin: "16mm 16mm 20mm",
            "@bottom-left": {
              content: JSON.stringify(book.name),
              fontSize: "9pt",
              color: theme.palette.text.secondary,
            },
            "@bottom-right": {
              content: "counter(page)",
              fontSize: "9pt",
              color: theme.palette.text.secondary,
            },
          },
          "@media print": {
            body: { backgroundColor: theme.palette.common.white },
            img: { printColorAdjust: "exact" },
          },
        }}
      />

      <Box
        component="section"
        sx={{
          minHeight: { sm: "240mm" },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 2.5,
          py: 4,
        }}
      >
        <BookCover book={book} size={220} />
        <Typography component="h1" sx={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
          {book.name}
        </Typography>
        {book.description && (
          <Typography sx={{ color: "text.secondary", maxWidth: 420 }}>{book.description}</Typography>
        )}
        <Typography sx={{ color: "text.secondary", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {count} {count === 1 ? "recipe" : "recipes"}
          {owner ? ` · from ${owner}` : ""}
        </Typography>
      </Box>

      <Box component="section" sx={page}>
        <Typography component="h2" sx={{ fontSize: 28, fontWeight: 800, mb: 2 }}>
          Contents
        </Typography>
        {sections.map((s) => (
          <Box key={s.id} sx={{ mb: 2, breakInside: "avoid" }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "primary.main",
                mb: 0.5,
              }}
            >
              {s.name}
            </Typography>
            {s.items.map((i) => (
              <Typography key={i._id} sx={{ fontSize: 14, lineHeight: 1.7 }}>
                {i.title || "Untitled"}
              </Typography>
            ))}
          </Box>
        ))}
      </Box>

      {sections.map((s) => (
        <Box component="section" key={s.id}>
          <Box
            sx={{
              ...page,
              minHeight: { sm: "240mm" },
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              gap: 1,
            }}
          >
            <Typography component="h2" sx={{ fontSize: 36, fontWeight: 800 }}>
              {s.name}
            </Typography>
            <Typography sx={{ color: "text.secondary" }}>
              {s.items.length} {s.items.length === 1 ? "recipe" : "recipes"}
            </Typography>
          </Box>
          {s.items.map((item) => (
            <Box key={item._id} sx={page}>
              <Recipe item={item} photos={photos} />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
