import { Box, Button, Divider, Typography } from "@mui/material";
import GemAmount from "../../../../components/GemAmount";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import type { ShopItem } from "../../../../hooks/user/useShop";

interface BuyItemDialogProps {
  item: ShopItem | null;
  balance: number;
  isBuying: boolean;
  onClose: () => void;
  onBuy: (item: ShopItem) => void;
  /** Shown when the balance falls short: takes the person to the gem packs. */
  onGetGems: () => void;
}

function Figure({ label, children, align }: { label: string; children: React.ReactNode; align?: "right" | "center" }) {
  return (
    <Box sx={{ textAlign: align }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box>{children}</Box>
    </Box>
  );
}

/** Confirms a purchase, showing the price, the balance and what is left afterwards. */
export default function BuyItemDialog({ item, balance, isBuying, onClose, onBuy, onGetGems }: BuyItemDialogProps) {
  const price = item?.price ?? 0;
  const canAfford = balance >= price;

  return (
    <ResponsiveDialog
      open={Boolean(item)}
      onClose={onClose}
      maxWidth="xs"
      title={item?.item.name}
      actions={
        <>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          {canAfford ? (
            <Button variant="contained" loading={isBuying} onClick={() => item && onBuy(item)}>
              Purchase
            </Button>
          ) : (
            <Button variant="contained" onClick={onGetGems}>
              Get gems
            </Button>
          )}
        </>
      }
    >
      {item && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2, display: "flex", justifyContent: "center" }}>
            <Box component="img" src={item.item.image} alt="" sx={{ height: 120, objectFit: "contain" }} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {item.item.description}
          </Typography>
          <Box
            sx={{
              ...cardSx,
              bgcolor: "action.hover",
              p: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Figure label="Price">
              <GemAmount amount={price} variant="h6" />
            </Figure>
            <Divider orientation="vertical" flexItem />
            <Figure label="Your balance" align="center">
              <GemAmount amount={balance} variant="h6" />
            </Figure>
            <Divider orientation="vertical" flexItem />
            <Figure label="After" align="right">
              <GemAmount amount={balance - price} variant="h6" color={canAfford ? "success.main" : "error.main"} />
            </Figure>
          </Box>
          {!canAfford && (
            <Typography variant="body2" color="error.main" sx={{ textAlign: "center" }}>
              Not enough gems. You need {(price - balance).toLocaleString()} more.
            </Typography>
          )}
        </Box>
      )}
    </ResponsiveDialog>
  );
}
