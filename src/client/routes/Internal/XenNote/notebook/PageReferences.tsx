import { Box, Button, Typography } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import { useSnackbar } from "notistack";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { useLinkMention, usePageBacklinks, usePageUnlinked } from "../../../../hooks/xennote/usePages";
import { pageTitle } from "./pageTree";

interface PageReferencesProps {
  pageId: string;
  onOpenPage: (id: string, options?: { beside?: boolean }) => void;
}

const cardSx = {
  all: "unset",
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  p: 1.25,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  cursor: "pointer",
  "&:hover": { bgcolor: "action.hover" },
  "&:focus-visible": { outline: 2, outlineStyle: "solid", outlineColor: "primary.main" },
} as const;

/**
 * Under a page's text: the pages that link to it ("Linked from"), and the ones that name it in plain text without linking
 * ("Mentioned in"), each with a button to make the mention a link.
 */
export default function PageReferences({ pageId, onOpenPage }: PageReferencesProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: backlinks = [] } = usePageBacklinks(pageId);
  const { data: unlinked = [] } = usePageUnlinked(pageId);
  const linkMention = useLinkMention();
  if (backlinks.length === 0 && unlinked.length === 0) return null;

  return (
    <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 3 }}>
      {backlinks.length > 0 && (
        <Box component="section" aria-label="Linked from" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="caption" sx={sectionLabelSx}>
            Linked from · {backlinks.length}
          </Typography>
          {backlinks.map((b) => (
            <Box
              key={b.id}
              component="button"
              type="button"
              onClick={(e: React.MouseEvent) => onOpenPage(b.id, { beside: e.shiftKey })}
              sx={cardSx}
            >
              <Typography sx={{ fontWeight: 500 }}>{pageTitle(b.title)}</Typography>
              {b.notebook_name && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {b.notebook_name}
                </Typography>
              )}
              {b.snippet && (
                <Typography variant="body2" color="text.secondary">
                  {b.snippet}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      {unlinked.length > 0 && (
        <Box component="section" aria-label="Mentioned in" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="caption" sx={sectionLabelSx}>
            Mentioned in · {unlinked.length}
          </Typography>
          {unlinked.map((m) => (
            <Box
              key={m.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.25,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Box
                component="button"
                type="button"
                onClick={(e: React.MouseEvent) => onOpenPage(m.id, { beside: e.shiftKey })}
                sx={{
                  all: "unset",
                  cursor: "pointer",
                  flex: 1,
                  minWidth: 0,
                  "&:focus-visible": { outline: 2, outlineStyle: "solid", outlineColor: "primary.main" },
                }}
              >
                <Typography sx={{ fontWeight: 500 }} noWrap>
                  {pageTitle(m.title)}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {m.snippet}
                </Typography>
              </Box>
              {m.can_edit && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<LinkIcon />}
                  disabled={linkMention.isPending}
                  onClick={() =>
                    linkMention.mutate(
                      { sourceId: m.id, targetId: pageId },
                      {
                        onError: (e) =>
                          enqueueSnackbar((e as Error).message || "Couldn't link it", { variant: "error" }),
                      },
                    )
                  }
                >
                  Link it
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
