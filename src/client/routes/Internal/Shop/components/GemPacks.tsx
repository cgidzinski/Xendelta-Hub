import { useState } from "react";
import { Alert, Box, Button, Card, CardActionArea, Chip, Grid, Skeleton, Typography } from "@mui/material";
import { formatMoney } from "@shared/money";
import { packBonusPercent, type GemPack } from "@shared/monetization";
import GemAmount from "../../../../components/GemAmount";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { useGemCheckout, useGemPacks } from "../../../../hooks/user/useGems";

const price = (pack: GemPack) => formatMoney(pack.priceCents / 100, pack.currency, { symbol: "narrow" });

function PackCard({ pack, onSelect }: { pack: GemPack; onSelect: (pack: GemPack) => void }) {
  const bonus = packBonusPercent(pack);
  return (
    <Card variant="outlined" sx={{ ...cardSx, height: "100%", "&:hover": { borderColor: "primary.main" } }}>
      <CardActionArea onClick={() => onSelect(pack)} sx={{ height: "100%", p: 1.75 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, minHeight: 24 }}>
          <GemAmount amount={pack.gems} variant="h6" iconSize={22} />
          {pack.badge && <Chip label={pack.badge} size="small" color="primary" variant="outlined" />}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {price(pack)}
          {bonus > 0 && ` · +${bonus}% bonus`}
        </Typography>
      </CardActionArea>
    </Card>
  );
}

/** The gem packs for sale, and the checkout dialog they open. */
export default function GemPacks() {
  const { info, isLoading } = useGemPacks();
  const { checkout, isPending } = useGemCheckout();
  const [selected, setSelected] = useState<GemPack | null>(null);

  if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />;
  if (!info?.available) {
    return (
      <Typography variant="body2" color="text.secondary">
        Buying gems is not available yet.
      </Typography>
    );
  }

  const handleBuy = async (pack: GemPack) => {
    if (await checkout(pack.id)) setSelected(null);
  };

  return (
    <>
      <Grid container spacing={1.5}>
        {info.packs.map((pack) => (
          <Grid size={{ xs: 6, md: 3 }} key={pack.id}>
            <PackCard pack={pack} onSelect={setSelected} />
          </Grid>
        ))}
      </Grid>

      <ResponsiveDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        maxWidth="xs"
        title="Buy gems"
        actions={
          <>
            <Button onClick={() => setSelected(null)} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" loading={isPending} onClick={() => selected && handleBuy(selected)}>
              {selected ? `Pay ${price(selected)}` : "Pay"}
            </Button>
          </>
        }
      >
        {selected && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box
              sx={{
                ...cardSx,
                bgcolor: "action.hover",
                p: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <GemAmount amount={selected.gems} variant="h5" iconSize={28} />
              <Typography variant="h6">{price(selected)}</Typography>
            </Box>
            {info.testMode && (
              <Alert severity="info" variant="outlined">
                Test mode: no card is charged and the gems are added straight away.
              </Alert>
            )}
          </Box>
        )}
      </ResponsiveDialog>
    </>
  );
}
