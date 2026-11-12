import { Box, Card, CardActionArea, Chip, Typography } from "@mui/material";
import GemAmount from "../../../../components/GemAmount";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import type { ShopItem } from "../../../../hooks/user/useShop";

interface ShopItemCardProps {
  item: ShopItem;
  onSelect: (item: ShopItem) => void;
}

/** One item for sale: picture, name, two-line description and the price in gems. */
export default function ShopItemCard({ item, onSelect }: ShopItemCardProps) {
  return (
    <Card variant="outlined" sx={{ ...cardSx, height: "100%", "&:hover": { borderColor: "primary.main" } }}>
      <CardActionArea
        onClick={() => onSelect(item)}
        sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}
      >
        <Box
          sx={{
            position: "relative",
            height: 140,
            bgcolor: "action.hover",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
          }}
        >
          <Box
            component="img"
            src={item.item.image}
            alt={item.item.name}
            sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
          {item.addToInventory === false && (
            <Chip label="Instant" color="success" size="small" sx={{ position: "absolute", top: 8, left: 8 }} />
          )}
        </Box>
        <Box sx={{ p: 1.75, flexGrow: 1, display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
            {item.item.name}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              flexGrow: 1,
            }}
          >
            {item.item.description}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <GemAmount amount={item.price ?? 0} />
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
}
