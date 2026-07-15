import { Box, Tabs, Tab, Chip, IconButton, Typography } from "@mui/material";
import CasinoIcon from "@mui/icons-material/Casino";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useLocation, useNavigate } from "react-router-dom";
import { useCasinoBalance } from "../../../../hooks/casino/useCasinoBalance";
import { useXenCasinoTitlebar } from "../context/XenCasinoTitlebarContext";

const ODDS_CHIP_SX = {
    color: "warning.main",
    bgcolor: "rgba(255, 167, 38, 0.12)",
    border: "1px solid rgba(255, 167, 38, 0.3)",
    fontWeight: 700,
} as const;

/**
 * The one navbar shared between the games list, the ledger, and every game page. Full
 * width, slim, sticky just below the app's own AppBar. On the games list / ledger it shows
 * the Games/Ledger tabs; on a game page (registered via XenCasinoTitlebarContext) those
 * tabs are replaced by the game's name, its odds, and the help button, centered on the bar
 * itself rather than just the leftover space. The cheddar balance stays on the right in
 * both states.
 */
export default function XenCasinoNavbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { linked, balance } = useCasinoBalance();
    const { titlebar } = useXenCasinoTitlebar();

    const activeTab = location.pathname.startsWith("/internal/xencasino/ledger") ? 1 : 0;

    return (
        <Box
            sx={{
                position: "sticky",
                top: 0,
                zIndex: (theme) => theme.zIndex.appBar - 1,
                display: "flex",
                alignItems: "center",
                gap: 2,
                height: 56,
                px: { xs: 2, sm: 3, md: 5 },
                bgcolor: "background.paper",
                borderBottom: "1px solid",
                borderColor: "divider",
            }}
        >
            {!titlebar && (
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => navigate(v === 0 ? "/internal/xencasino" : "/internal/xencasino/ledger")}
                    sx={{ minHeight: 56, "& .MuiTab-root": { minHeight: 56 } }}
                >
                    <Tab label="Games" />
                    <Tab label="Ledger" />
                </Tabs>
            )}

            {titlebar && (
                <Box
                    sx={{
                        position: "absolute",
                        left: "50%",
                        transform: "translateX(-50%)",
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        maxWidth: "60vw",
                    }}
                >
                    <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
                        {titlebar.title}
                    </Typography>
                    {titlebar.oddsLabel && <Chip label={titlebar.oddsLabel} size="small" sx={ODDS_CHIP_SX} />}
                    <IconButton size="small" onClick={titlebar.onOpenHelp} aria-label="How to play">
                        <HelpOutlineIcon fontSize="small" />
                    </IconButton>
                </Box>
            )}

            <Box sx={{ flex: 1 }} />

            <Chip
                icon={<CasinoIcon />}
                label={linked ? (balance ?? "—") : "—"}
                variant="outlined"
                sx={{
                    borderColor: "warning.main",
                    color: "warning.main",
                    fontWeight: 700,
                    "& .MuiChip-label": { fontVariantNumeric: "tabular-nums" },
                    "& .MuiChip-icon": { color: "#FFD700" },
                }}
            />
        </Box>
    );
}
