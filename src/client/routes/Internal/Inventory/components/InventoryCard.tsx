import { formatDistance } from "date-fns";
import { Box, Button, Card, IconButton, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { BADGES } from "@shared/cosmetics";
import type { InventoryItem } from "../../../../hooks/user/useInventory";

/** Cosmetics are worn rather than redeemed. */
export const isWearable = (itemKey: string) => itemKey in BADGES;

interface InventoryCardProps {
  item: InventoryItem;
  onRedeem: (item: InventoryItem) => void;
  onTrash: (item: InventoryItem) => void;
  /** Wear (true) or take off (false) a cosmetic. */
  onWear: (item: InventoryItem, wear: boolean) => void;
  /** True when this cosmetic is what the person is wearing now. */
  worn: boolean;
  busy: boolean;
}

const ago = (date: string) => formatDistance(new Date(date), new Date(), { addSuffix: true });

/** One owned item. The action is on the card, so nothing needs a dialog. */
export default function InventoryCard({ item, onRedeem, onTrash, onWear, worn, busy }: InventoryCardProps) {
  const redeemed = item.used;
  const wearable = isWearable(item.itemKey);
  return (
    <Card variant="outlined" sx={{ ...cardSx, height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          position: "relative",
          height: 96,
          bgcolor: "action.hover",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
        }}
      >
        <Box
          component="img"
          src={item.image}
          alt=""
          sx={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            filter: redeemed ? "grayscale(1)" : "none",
            opacity: redeemed ? 0.6 : 1,
          }}
        />
        <IconButton
          size="small"
          aria-label={`Trash ${item.name}`}
          disabled={busy}
          onClick={() => onTrash(item)}
          sx={{ position: "absolute", top: 4, right: 4, color: "text.secondary" }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ p: 2, flexGrow: 1 }}>
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{ fontWeight: 500 }}
          color={redeemed ? "text.secondary" : undefined}
        >
          {item.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {redeemed && item.usedAt ? `Redeemed ${ago(item.usedAt)}` : `Bought ${ago(item.purchasedAt)}`}
        </Typography>
        {worn && (
          <Typography variant="body2" color="success.main" sx={{ fontWeight: 700 }}>
            Wearing now
          </Typography>
        )}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        {wearable ? (
          <Button
            fullWidth
            variant={worn ? "outlined" : "contained"}
            loading={busy}
            onClick={() => onWear(item, !worn)}
            sx={{ minHeight: 44 }}
          >
            {worn ? "Take off" : "Wear"}
          </Button>
        ) : redeemed ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", lineHeight: "44px" }}>
            Redeemed
          </Typography>
        ) : item.redeemable ? (
          <Button fullWidth variant="contained" loading={busy} onClick={() => onRedeem(item)} sx={{ minHeight: 44 }}>
            Redeem
          </Button>
        ) : (
          <Typography
            variant="body2"
            color="success.main"
            sx={{ textAlign: "center", lineHeight: "44px", fontWeight: 700 }}
          >
            Yours to keep
          </Typography>
        )}
      </Box>
    </Card>
  );
}
