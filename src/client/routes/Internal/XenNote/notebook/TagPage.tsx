import { useMemo, useState } from "react";
import { Box, Chip, Typography } from "@mui/material";
import TagIcon from "@mui/icons-material/Tag";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { useNotebookSearch } from "../../../../hooks/xennote/usePages";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import { pageTitle } from "./pageTree";

interface TagPageProps {
  notebookId: string;
  tag: string;
  pages: PageTreeEntry[];
  sections: XenNoteSection[];
  onOpenPage: (id: string, notebookId: string, inNotebook: boolean) => void;
  onOpenTag: (tag: string) => void;
}

const rowSx = {
  all: "unset",
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  p: 1.5,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  cursor: "pointer",
  "&:hover": { bgcolor: "action.hover" },
  "&:focus-visible": { outline: 2, outlineStyle: "solid", outlineColor: "primary.main" },
} as const;

/**
 * A tag's page: every page with the tag in this notebook (read from the notebook's tree), or across all the person's
 * notebooks (asked of the server), and the tags that go with it.
 */
export default function TagPage({ notebookId, tag, pages, sections, onOpenPage, onOpenTag }: TagPageProps) {
  const [everywhere, setEverywhere] = useState(false);
  const here = useMemo(() => pages.filter((p) => p.tags.includes(tag) && !p.archived), [pages, tag]);
  const all = useNotebookSearch("", { tag });
  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name;

  // The tags that appear on the same pages.
  const related = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of here) for (const t of p.tags) if (t !== tag) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [here, tag]);

  const rows = everywhere
    ? (all.data ?? []).map((h) => ({
        id: h.id,
        title: h.title,
        notebook_id: h.notebook_id,
        in_notebook: h.in_notebook,
        place: [h.notebook_name, h.section_name].filter(Boolean).join(" / "),
        excerpt: h.snippet,
      }))
    : here.map((p) => ({
        id: p.id,
        title: p.title,
        notebook_id: notebookId,
        in_notebook: true,
        place: sectionName(p.section_id) ?? "",
        excerpt: p.excerpt,
      }));

  return (
    <Box
      sx={{
        maxWidth: 860,
        mx: "auto",
        px: { xs: 2, sm: 4 },
        py: { xs: 2, sm: 3 },
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Typography variant="h4" component="h2" sx={{ color: "primary.main", fontWeight: 600 }}>
        #{tag}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }} role="group" aria-label="Where to look">
        <Chip
          label={`This notebook · ${here.length}`}
          color={everywhere ? "default" : "primary"}
          variant={everywhere ? "outlined" : "filled"}
          onClick={() => setEverywhere(false)}
        />
        <Chip
          label={`All notebooks${all.data ? ` · ${all.data.length}` : ""}`}
          color={everywhere ? "primary" : "default"}
          variant={everywhere ? "filled" : "outlined"}
          onClick={() => setEverywhere(true)}
        />
      </Box>

      {everywhere && all.isPending ? (
        <ListSkeleton rows={3} height={72} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<TagIcon />}
          title="No pages with this tag"
          description="Add the tag to a page, or write it in the text with #."
        />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {rows.map((r) => (
            <Box
              key={r.id}
              component="button"
              type="button"
              onClick={() => onOpenPage(r.id, r.notebook_id, r.in_notebook)}
              sx={rowSx}
            >
              <Typography sx={{ fontWeight: 500 }}>{pageTitle(r.title)}</Typography>
              {r.place && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {r.place}
                </Typography>
              )}
              {r.excerpt && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {r.excerpt}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      {related.length > 0 && !everywhere && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" sx={sectionLabelSx}>
            Related tags
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.75 }}>
            {related.map(([t, n]) => (
              <Chip key={t} variant="outlined" size="small" label={`#${t} · ${n}`} onClick={() => onOpenTag(t)} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
