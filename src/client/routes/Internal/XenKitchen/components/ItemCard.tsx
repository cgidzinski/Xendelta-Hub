import { Box, Card, CardActionArea, Checkbox, IconButton, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import LinkIcon from "@mui/icons-material/Link";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import type { KitchenItem } from "../../../../hooks/xenkitchen/useKitchen";
import { itemSummary } from "../../../../hooks/xenkitchen/kitchenSummary";
import { CategoryIconView } from "./kitchenIcons";

interface ItemCardProps {
  item: KitchenItem;
  onOpen: () => void;
  /** Omit on read-only pages (public book). */
  onToggleFavorite?: () => void;
  selecting?: boolean;
  selected?: boolean;
  /** Omit when the viewer can't edit this item, so it can't be selected for bulk actions. */
  onToggleSelect?: () => void;
  /** Shown under the title in the All-books view. */
  bookLabel?: string;
}

export default function ItemCard({
  item,
  onOpen,
  onToggleFavorite,
  selecting = false,
  selected = false,
  onToggleSelect,
  bookLabel,
}: ItemCardProps) {
  const theme = useTheme();
  const accent = item.category?.color ?? theme.palette.primary.main;
  const cover = item.images[0]?.url;
  const summary = itemSummary(item);

  // Long-press starts selecting on touch screens, where there's no hover checkbox.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  const startPress = () => {
    if (onToggleSelect) pressTimer = setTimeout(onToggleSelect, 500);
  };
  const endPress = () => clearTimeout(pressTimer);

  return (
    <Card
      variant="outlined"
      sx={{
        ...cardSx,
        borderRadius: 3,
        position: "relative",
        overflow: "hidden",
        transition: "transform .15s, box-shadow .15s, border-color .15s",
        borderColor: selected ? accent : "divider",
        outline: selected ? `2px solid ${accent}` : "none",
        "&:hover": { transform: "translateY(-2px)", boxShadow: theme.shadows[4] },
        "&:hover .kitchen-select": { opacity: 1 },
      }}
    >
      <CardActionArea
        onClick={selecting && onToggleSelect ? onToggleSelect : onOpen}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchMove={endPress}
        onContextMenu={(e) => {
          if (!selecting && onToggleSelect) {
            e.preventDefault();
            onToggleSelect();
          }
        }}
      >
        <Box sx={{ position: "relative", aspectRatio: "4 / 3", bgcolor: alpha(accent, 0.12) }}>
          {cover ? (
            <Box
              component="img"
              src={cover}
              alt=""
              loading="lazy"
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <Box
              sx={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `linear-gradient(135deg, ${alpha(accent, 0.35)} 0%, ${alpha(accent, 0.08)} 100%)`,
              }}
            >
              <CategoryIconView icon={item.category?.icon} sx={{ fontSize: 56, color: alpha(accent, 0.85) }} />
            </Box>
          )}
          <Box
            sx={{
              position: "absolute",
              inset: "auto 0 0 0",
              height: 48,
              background: "linear-gradient(transparent, rgba(0,0,0,0.35))",
            }}
          />
          {item.category && (
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{
                position: "absolute",
                left: 8,
                bottom: 8,
                px: 1,
                py: 0.25,
                borderRadius: 5,
                bgcolor: alpha(theme.palette.background.paper, 0.9),
                backdropFilter: "blur(4px)",
              }}
            >
              <CategoryIconView icon={item.category.icon} sx={{ fontSize: 14, color: accent }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {item.category.name}
              </Typography>
            </Stack>
          )}
          {item.share?.enabled && (
            <Box
              sx={{
                position: "absolute",
                right: 8,
                bottom: 8,
                width: 24,
                height: 24,
                borderRadius: "50%",
                bgcolor: alpha(theme.palette.background.paper, 0.9),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Shared by link"
            >
              <LinkIcon sx={{ fontSize: 16 }} />
            </Box>
          )}
        </Box>
        <Box sx={{ p: 1.5, pr: 5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
            {item.title || "Untitled"}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ minHeight: 20 }}>
            {summary || " "}
          </Typography>
          {bookLabel && (
            <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>
              {bookLabel}
            </Typography>
          )}
        </Box>
      </CardActionArea>

      {onToggleFavorite && (
        <IconButton
          aria-label={item.favorite ? "Unfavorite" : "Favorite"}
          onClick={onToggleFavorite}
          size="small"
          sx={{ position: "absolute", right: 6, bottom: 12, color: item.favorite ? "warning.main" : "text.disabled" }}
        >
          {item.favorite ? <StarIcon /> : <StarBorderIcon />}
        </IconButton>
      )}

      {onToggleSelect && (
        <Checkbox
          className="kitchen-select"
          checked={selected}
          onChange={onToggleSelect}
          inputProps={{ "aria-label": "Select" }}
          sx={{
            position: "absolute",
            top: 6,
            left: 6,
            p: 0.5,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.background.paper, 0.85),
            opacity: selecting ? 1 : 0,
            transition: "opacity .15s",
            "@media (hover: none)": { display: selecting ? "inline-flex" : "none" },
            "&:hover": { bgcolor: theme.palette.background.paper },
          }}
        />
      )}
    </Card>
  );
}
