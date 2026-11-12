import { useState } from "react";
import { Alert, Box, Button, ButtonBase, Skeleton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { formatMoney } from "@shared/money";
import { packBonusPercent, type GemPack } from "@shared/monetization";
import GemAmount from "../../../../components/GemAmount";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { useGemCheckout, useGemPacks } from "../../../../hooks/user/useGems";

const price = (pack: GemPack) => formatMoney(pack.priceCents / 100, pack.currency, { symbol: "narrow" });

interface PackButtonProps {
  pack: GemPack;
  selected: boolean;
  onSelect: (id: string) => void;
}

function PackButton({ pack, selected, onSelect }: PackButtonProps) {
  const bonus = packBonusPercent(pack);
  return (
    <ButtonBase
      onClick={() => onSelect(pack.id)}
      aria-pressed={selected}
      sx={{
        ...cardSx,
        borderColor: selected ? "primary.main" : "divider",
        borderWidth: selected ? 2 : 1,
        bgcolor: (t) => (selected ? alpha(t.palette.primary.main, 0.12) : "transparent"),
        px: 1.75,
        py: 1.25,
        minHeight: 52,
        display: "flex",
        justifyContent: "space-between",
        textAlign: "left",
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <Typography component="span" variant="body1" sx={{ fontWeight: selected ? 700 : 500 }}>
        {pack.gems.toLocaleString()} gems
        {bonus > 0 && (
          <Typography component="span" variant="caption" color="success.main" sx={{ ml: 0.75, fontWeight: 700 }}>
            +{bonus}%
          </Typography>
        )}
      </Typography>
      <Typography component="span" variant="body2" color={selected ? "text.primary" : "text.secondary"}>
        {price(pack)}
      </Typography>
    </ButtonBase>
  );
}

/** The top of the Shop: pick a gem pack on the left, see what you would have and pay on the right. */
export default function GemHero({ balance }: { balance: number }) {
  const { info, isLoading } = useGemPacks();
  const { checkout, isPending } = useGemCheckout();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <Skeleton variant="rectangular" height={230} sx={{ borderRadius: 2 }} />;

  const packs = info?.packs ?? [];
  if (!info?.available || packs.length === 0) {
    return (
      <Box sx={{ ...cardSx, p: 3 }}>
        <Typography variant="overline" color="text.secondary">
          Gems
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Buying gems is not available yet.
        </Typography>
      </Box>
    );
  }

  const selected = packs.find((p) => p.id === selectedId) ?? packs.find((p) => p.badge === "Popular") ?? packs[0];
  const bonus = packBonusPercent(selected);

  return (
    <Box sx={{ ...cardSx, display: "flex", flexDirection: { xs: "column", md: "row" }, overflow: "hidden" }}>
      <Box sx={{ flex: 1, p: { xs: 2.5, md: 3.5 }, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          Gems
        </Typography>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
          Top up your gems
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
          Gems pay for storage and ways to stand out. Bigger packs give a bonus.
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 1.25, mt: 1 }}>
          {packs.map((pack) => (
            <PackButton key={pack.id} pack={pack} selected={pack.id === selected.id} onSelect={setSelectedId} />
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          width: { md: 340 },
          flexShrink: 0,
          bgcolor: "action.hover",
          borderTop: { xs: 1, md: 0 },
          borderLeft: { md: 1 },
          borderColor: "divider",
          p: { xs: 2.5, md: 3.5 },
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 1.75,
        }}
      >
        <Box>
          <GemAmount amount={selected.gems} variant="h4" iconSize={40} />
          <Typography variant="body2" color="text.secondary">
            {price(selected)}
            {bonus > 0 && ` · ${bonus}% bonus`}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          You would have {(balance + selected.gems).toLocaleString()} gems.
        </Typography>
        <Button variant="contained" size="large" loading={isPending} onClick={() => checkout(selected.id)}>
          Pay {price(selected)}
        </Button>
        {info.testMode && (
          <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
            Test mode: no card is charged.
          </Alert>
        )}
      </Box>
    </Box>
  );
}
