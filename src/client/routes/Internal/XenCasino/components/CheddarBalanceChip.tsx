import { Box, Chip } from "@mui/material";
import { useCasinoBalance } from "../../../../hooks/casino/useCasinoBalance";
import { formatCheddar } from "../utils/currency";

// The one cheddar-balance chip style, shared by the outer navbar and every game's modal
// topbar (the outer navbar is hidden behind a fullscreen/dialog game modal, so the modal
// needs its own copy of this to keep the balance visible while actually playing). The 🧀
// icon matches the same balance display on the homepage's pinned XenCasino card.
export default function CheddarBalanceChip() {
    const { linked, balance } = useCasinoBalance();
    return (
        <Chip
            icon={
                <Box component="span" sx={{ fontSize: 16, lineHeight: 1 }}>
                    🧀
                </Box>
            }
            label={linked ? formatCheddar(balance) : "—"}
            variant="outlined"
            sx={{
                borderColor: "warning.main",
                color: "warning.main",
                fontWeight: 700,
                // A fixed-ish width so the balance changing digit count (e.g. after a spin)
                // doesn't reflow/expand the bar it sits in and trigger a scrollbar.
                minWidth: 96,
                justifyContent: "center",
                flexShrink: 0,
                "& .MuiChip-label": { fontVariantNumeric: "tabular-nums" },
            }}
        />
    );
}
