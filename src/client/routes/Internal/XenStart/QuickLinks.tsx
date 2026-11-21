import { useRef, useState, type PointerEvent } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  DEFAULT_APPEARANCE,
  parseQuickLinkUrl,
  quickLinkSlots,
  type QuickLink,
  type WidgetSize,
} from "@shared/xenstart";
import { RADIUS } from "../../../theme";

export function quickLinkColumns(columns = DEFAULT_APPEARANCE.columns) {
  return { xs: Math.min(columns, 3), sm: Math.min(columns, 4), md: columns };
}

export function LinkIconImage({ url, size = 20 }: { url?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const iconSx = { width: size, height: size, maxWidth: "75%", objectFit: "contain" } as const;
  if (failed || !url) return <LinkIcon sx={iconSx} aria-hidden />;
  return (
    <Box
      component="img"
      src={url}
      alt=""
      width={size}
      height={size}
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      sx={iconSx}
    />
  );
}

interface QuickLinksProps {
  links: QuickLink[];
  rows: number;
  compact?: boolean;
  columns: number;
  size?: WidgetSize;
  editing: boolean;
  saving: boolean;
  onEdit: (link: QuickLink | null, slot: number) => void;
  onMove: (from: string, to: number) => void;
}

const tileWidths: Record<WidgetSize, number> = { small: 64, medium: 88, large: 120 };
const iconWidths: Record<WidgetSize, number> = { small: 24, medium: 30, large: 38 };
const dragThreshold = 5;

interface TileDrag {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
}

export default function QuickLinks({
  links,
  rows,
  columns,
  size = "medium",
  compact,
  editing,
  saving,
  onEdit,
  onMove,
}: QuickLinksProps) {
  const visible = quickLinkSlots(links).slice(0, rows * columns);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<TileDrag | null>(null);
  const suppressClick = useRef(false);
  const [target, setTarget] = useState<number>();
  const targetAt = (event: PointerEvent) => {
    const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-link-slot]");
    return tile && grid.current?.contains(tile) ? Number(tile.dataset.linkSlot) : undefined;
  };
  const clearDrag = () => {
    drag.current = null;
    setTarget(undefined);
  };
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (saving || !event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const trackDrag = (event: PointerEvent) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < dragThreshold) return;
    current.moved = true;
    suppressClick.current = true;
    setTarget(targetAt(event));
  };
  const cancelDrag = (event: PointerEvent) => {
    if (drag.current?.pointerId === event.pointerId) clearDrag();
  };

  const faceSx = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 0.65,
    px: 0.75,
    overflow: "hidden",
    borderRadius: RADIUS.lg,
    color: "inherit",
    textDecoration: "none",
    "&:hover": { bgcolor: "action.hover" },
    "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
  } as const;
  const tileSx = {
    position: "relative",
    minWidth: 0,
    aspectRatio: "1",
    border: "1px solid",
    borderColor: "divider",
    borderRadius: RADIUS.lg,
  } as const;

  return (
    <Box
      ref={grid}
      sx={{
        display: "grid",
        justifyContent: "center",
        gridTemplateColumns: Object.fromEntries(
          Object.entries(quickLinkColumns(columns)).map(([breakpoint, count]) => [
            breakpoint,
            `repeat(${compact ? Math.min(count, 2) : count}, minmax(0, ${tileWidths[size]}px))`,
          ]),
        ),
        gap: 1,
      }}
    >
      {visible.map((link, slot) => {
        const borderColor = target === slot ? "primary.main" : "divider";
        if (!link)
          return editing ? (
            <ButtonBase
              key={slot}
              data-link-slot={slot}
              disabled={saving}
              onClick={() => onEdit(null, slot)}
              sx={{
                ...faceSx,
                ...tileSx,
                height: "auto",
                borderStyle: "dashed",
                borderColor,
                bgcolor: target === slot ? "action.selected" : undefined,
                color: "text.secondary",
              }}
            >
              <AddIcon fontSize="small" />
              <Typography variant="caption">Add link</Typography>
            </ButtonBase>
          ) : (
            <Box key={slot} aria-hidden="true" sx={tileSx} />
          );
        const icon =
          parseQuickLinkUrl(link.iconUrl ?? "") ?? (parseQuickLinkUrl(link.url) && new URL("/favicon.ico", link.url));
        const label = (
          <>
            <LinkIconImage key={icon?.href} url={icon?.href} size={iconWidths[size]} />
            <Typography variant="caption" sx={{ maxWidth: "100%" }} noWrap>
              {link.label}
            </Typography>
          </>
        );
        return (
          <Box
            key={link.id}
            data-link-slot={slot}
            sx={{
              ...tileSx,
              bgcolor: "background.paper",
              borderColor,
            }}
          >
            {editing ? (
              <ButtonBase
                sx={{
                  ...faceSx,
                  touchAction: "none",
                  userSelect: "none",
                  cursor: "grab",
                  "&:active": { cursor: "grabbing" },
                }}
                disableRipple
                onPointerDown={startDrag}
                onPointerMove={trackDrag}
                onPointerUp={(event) => {
                  const current = drag.current;
                  if (current?.pointerId !== event.pointerId) return;
                  const destination = targetAt(event);
                  const moved =
                    current.moved || Math.hypot(event.clientX - current.x, event.clientY - current.y) >= dragThreshold;
                  suppressClick.current = moved;
                  clearDrag();
                  if (moved && destination !== undefined && slot !== destination) onMove(link.id, destination);
                }}
                onLostPointerCapture={cancelDrag}
                onPointerCancel={cancelDrag}
                onClick={(event) => {
                  if (event.detail === 0 || !suppressClick.current) onEdit(link, slot);
                  suppressClick.current = false;
                }}
                disabled={saving}
                aria-label={`Edit ${link.label}`}
              >
                {label}
              </ButtonBase>
            ) : (
              <ButtonBase component="a" href={link.url} sx={faceSx} title={link.label}>
                {label}
              </ButtonBase>
            )}
            {editing && (
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: "grid",
                  placeItems: "center",
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 28,
                  height: 24,
                  color: "text.secondary",
                  pointerEvents: "none",
                }}
              >
                <DragIndicatorIcon fontSize="small" />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
