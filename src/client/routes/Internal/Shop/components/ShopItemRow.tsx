import { Box, Card, CardActionArea, Typography } from "@mui/material";
import GemAmount from "../../../../components/GemAmount";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import type { ShopItem } from "../../../../hooks/user/useShop";

interface ShopItemRowProps {
  item: ShopItem;
  onSelect: (item: ShopItem) => void;
}

/** A compact horizontal item: small picture, name and description, price on the right. Used for storage. */
export default function ShopItemRow({ item, onSelect }: ShopItemRowProps) {
  return (
    <Card variant="outlined" sx={{ ...cardSx, opacity: 0.55, filter: "grayscale(1)" }}>
      <CardActionArea
        disabled
        onClick={() => onSelect(item)}
        sx={{ display: "flex", alignItems: "center", gap: 2, p: 2 }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: 2,
            bgcolor: "action.hover",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 1,
          }}
        >
          <Box
            component="img"
            src={item.item.image}
            alt=""
            sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h3" noWrap sx={{ fontWeight: 500 }}>
            {item.item.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {item.item.description}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <GemAmount amount={item.price ?? 0} />
          <Typography variant="caption" color="text.secondary" component="div">
            Out of stock
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}
