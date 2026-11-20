import { useRef, useState, type PointerEvent } from "react";
import { Box, ButtonBase, IconButton, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { parseQuickLinkUrl, QUICK_LINK_LIMIT, type QuickLink } from "@shared/xenstart";
import { RADIUS } from "../../../theme";

const columns = { xs: 3, sm: 4, md: 6 };

export const quickLinkColumns = columns;

function LinkIconImage({ origin }: { origin: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !origin) return <LinkIcon fontSize="small" aria-hidden />;
  return (
    <Box
      component="img"
      src={`${origin}/favicon.ico`}
      alt=""
      width={20}
      height={20}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      sx={{ objectFit: "contain" }}
    />
  );
}

interface QuickLinksProps {
  links: QuickLink[];
  editing: boolean;
  saving: boolean;
  onEdit: (link: QuickLink | null) => void;
  onMove: (from: string, to: string) => void;
}

export default function QuickLinks({ links, editing, saving, onEdit, onMove }: QuickLinksProps) {
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; pointer: number } | null>(null);
  const [target, setTarget] = useState<string>();
  const targetAt = (event: PointerEvent) => {
    const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-link-id]");
    return tile && grid.current?.contains(tile) ? tile.dataset.linkId : undefined;
  };
  const clearDrag = () => {
    drag.current = null;
    setTarget(undefined);
  };

  const faceSx = {
    width: "100%",
    minHeight: 76,
    display: "flex",
    flexDirection: "column",
    gap: 0.65,
    px: 0.75,
    py: 1,
    borderRadius: RADIUS.lg,
    color: "inherit",
    textDecoration: "none",
    "&:hover": { bgcolor: "action.hover" },
    "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
  } as const;

  return (
    <Box
      ref={grid}
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(3, minmax(0, 1fr))",
          sm: "repeat(4, minmax(0, 1fr))",
          md: "repeat(6, minmax(0, 1fr))",
        },
        gap: 1,
      }}
    >
      {links.map((link, index) => {
        const origin = parseQuickLinkUrl(link.url)?.origin ?? "";
        const label = (
          <>
            <LinkIconImage key={origin} origin={origin} />
            <Typography variant="body2" sx={{ maxWidth: "100%" }} noWrap>
              {link.label}
            </Typography>
          </>
        );
        const earlier = links[index - 1];
        const later = links[index + 1];
        return (
          <Box
            key={link.id}
            data-link-id={link.id}
            sx={{
              minWidth: 0,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: target === link.id ? "primary.main" : "divider",
              borderRadius: RADIUS.lg,
            }}
          >
            {editing ? (
              <ButtonBase sx={faceSx} onClick={() => onEdit(link)} disabled={saving} aria-label={`Edit ${link.label}`}>
                {label}
              </ButtonBase>
            ) : (
              <ButtonBase component="a" href={link.url} sx={faceSx} title={link.label}>
                {label}
              </ButtonBase>
            )}
            {editing && (
              <Stack direction="row" justifyContent="center" sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                <Box
                  component="span"
                  aria-hidden="true"
                  onPointerDown={(event) => {
                    if (saving || !event.isPrimary || event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { id: link.id, pointer: event.pointerId };
                    setTarget(link.id);
                  }}
                  onPointerMove={(event) => {
                    if (drag.current?.pointer === event.pointerId) setTarget(targetAt(event));
                  }}
                  onPointerUp={(event) => {
                    if (drag.current?.pointer !== event.pointerId) return;
                    const destination = targetAt(event);
                    const from = drag.current.id;
                    clearDrag();
                    if (destination && from !== destination) onMove(from, destination);
                  }}
                  onLostPointerCapture={clearDrag}
                  onPointerCancel={clearDrag}
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    minWidth: 22,
                    minHeight: 36,
                    color: "text.secondary",
                    touchAction: "none",
                    cursor: "grab",
                  }}
                >
                  <DragIndicatorIcon fontSize="small" />
                </Box>
                <IconButton
                  size="small"
                  aria-label={`Move ${link.label} earlier`}
                  disabled={saving || !earlier}
                  onClick={() => earlier && onMove(link.id, earlier.id)}
                  sx={{ px: 0.25 }}
                >
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Move ${link.label} later`}
                  disabled={saving || !later}
                  onClick={() => later && onMove(link.id, later.id)}
                  sx={{ px: 0.25 }}
                >
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
              </Stack>
            )}
          </Box>
        );
      })}
      {Array.from({ length: QUICK_LINK_LIMIT - links.length }, (_, i) =>
        editing ? (
          <ButtonBase
            key={i}
            disabled={saving}
            onClick={() => onEdit(null)}
            sx={{ ...faceSx, minWidth: 0, border: "1px dashed", borderColor: "divider", color: "text.secondary" }}
          >
            <AddIcon fontSize="small" />
            <Typography variant="body2">Add link</Typography>
          </ButtonBase>
        ) : (
          <Box
            key={i}
            aria-hidden="true"
            sx={{ minHeight: 78, border: "1px solid", borderColor: "divider", borderRadius: RADIUS.lg }}
          />
        ),
      )}
    </Box>
  );
}
