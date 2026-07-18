import { Box, Tabs, Tab, Typography, Chip } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useLocation, useNavigate } from "react-router-dom";
import { useXenCasinoTitlebar } from "../context/XenCasinoTitlebarContext";
import { useCasinoDailyQuest } from "../../../../hooks/casino/useCasinoDailyQuest";
import CheddarBalanceChip from "./CheddarBalanceChip";

/**
 * The one navbar shared between the games list, the ledger, and every game page. Full
 * width, slim, sticky just below the app's own AppBar. On the games list / ledger it shows
 * the Games/Ledger tabs, left-aligned; on a game page (registered via
 * XenCasinoTitlebarContext) those tabs are replaced by the game's name, left-aligned with a
 * responsive max-width + ellipsis so it can't overflow/get cut off on narrow screens. (The
 * odds ratio itself lives under the Start Playing button, not here - see PlayLauncher.) The
 * cheddar balance stays on the right in both states.
 */
export default function XenCasinoNavbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { titlebar } = useXenCasinoTitlebar();

    const activeTab = location.pathname.startsWith("/internal/xencasino/stats")
        ? 2
        : location.pathname.startsWith("/internal/xencasino/ledger")
            ? 1
            : 0;
    const { canClaim } = useCasinoDailyQuest();

    return (
        <Box
            sx={{
                position: "sticky",
                top: 0,
                zIndex: (theme) => theme.zIndex.appBar - 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
                height: 56,
                px: { xs: 2, sm: 3, md: 5 },
                bgcolor: "background.paper",
                borderBottom: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
            }}
        >
            {!titlebar ? (
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => {
                        if (v === 0) navigate("/internal/xencasino");
                        else if (v === 1) navigate("/internal/xencasino/ledger");
                        else navigate("/internal/xencasino/stats");
                    }}
                    sx={{ minHeight: 56, flexShrink: 0, "& .MuiTab-root": { minHeight: 56 } }}
                >
                    <Tab label="Games" />
                    <Tab label="Ledger" />
                    <Tab label="Stats" />
                </Tabs>
            ) : (
                <Typography
                    variant="h6"
                    noWrap
                    sx={{
                        fontWeight: 700,
                        flexShrink: 1,
                        minWidth: 0,
                    }}
                >
                    {titlebar.title}
                </Typography>
            )}

            <Box sx={{ flex: 1, minWidth: 0 }} />

            {canClaim && (
                <Chip
                    icon={<EmojiEventsIcon />}
                    label="Quest ready"
                    color="warning"
                    size="small"
                    onClick={() => navigate("/internal/xencasino")}
                    sx={{ fontWeight: 700, flexShrink: 0 }}
                />
            )}
            <CheddarBalanceChip />
        </Box>
    );
}
