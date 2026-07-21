import { ReactNode, useState } from "react";
import { Box, Button, Card, CardContent, Chip, Dialog, IconButton, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheddarBalanceChip from "./CheddarBalanceChip";
import { formatCheddar } from "../utils/currency";

const ODDS_CHIP_SX = {
    alignSelf: "flex-start",
    color: "info.main",
    bgcolor: "rgba(25, 118, 210, 0.12)",
    border: "1px solid rgba(25, 118, 210, 0.3)",
    fontWeight: 700,
} as const;

const RTP_CHIP_SX = {
    alignSelf: "flex-start",
    color: "secondary.main",
    bgcolor: "rgba(156, 39, 176, 0.12)",
    border: "1px solid rgba(156, 39, 176, 0.3)",
    fontWeight: 700,
} as const;

const JACKPOT_CHIP_SX = {
    alignSelf: "flex-start",
    color: "#000",
    bgcolor: "warning.main",
    border: "1px solid rgba(255, 193, 7, 0.6)",
    fontWeight: 800,
} as const;

interface PlayLauncherProps {
    title?: string; // game name, shown in the card header
    description?: string; // short game description, shown under the title
    jackpotLabel?: string; // e.g. "🎰 1.2M" - jackpot chip, top-right
    price?: number; // cost per play in cheddar
    oddsLabel?: string; // e.g. "1:2.97" - shown in the stats footer
    rtpLabel?: string; // e.g. "RTP 95.2%" - shown beside oddsLabel, always
    startLabel?: string;
    onOpen?: () => void;
    onClose?: () => void;
    headerActions?: ReactNode;
    fullBleed?: boolean;
    children: ReactNode;
}

/**
 * Card-shelled launcher shown on every game's page before the modal opens. Mirrors the
 * GamesIndex card layout: game title, cost-per-play in red, an optional jackpot chip
 * top-right, a centred Start Playing button, and a stats footer with odds (blue) and RTP
 * (purple) chips. Clicking the button opens the modal Dialog that hosts the actual game.
 */
export default function PlayLauncher({
    title,
    description,
    jackpotLabel,
    price,
    oddsLabel,
    rtpLabel,
    startLabel = "Start Playing",
    onOpen,
    onClose,
    headerActions,
    fullBleed,
    children,
}: PlayLauncherProps) {
    const [playing, setPlaying] = useState(false);
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

    return (
        <>
            <Card
                sx={{
                    my: 4,
                }}
            >
                <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                    {/* Header: cost (left), jackpot (right) */}
                    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, mb: 2 }}>
                        {price !== undefined && (
                            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                <Typography component="span" variant="body2" color="error.main" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                    {formatCheddar(price)}
                                </Typography>
                                {" / play"}
                            </Typography>
                        )}
                        {jackpotLabel && (
                            <Chip label={jackpotLabel} size="small" sx={{ ...JACKPOT_CHIP_SX, flexShrink: 0 }} />
                        )}
                    </Box>

                    {/* Start Playing button */}
                    <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                        <Button
                            variant="contained"
                            color="warning"
                            size="large"
                            onClick={() => {
                                onOpen?.();
                                setPlaying(true);
                            }}
                            sx={{ borderRadius: 999, px: 5, py: 1.5, fontWeight: 800 }}
                        >
                            {startLabel}
                        </Button>
                    </Box>

                    {/* Stats footer: odds + RTP */}
                    <Box
                        sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            gap: 0.75,
                            pt: 1.5,
                            borderTop: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <Chip label={oddsLabel ?? "???"} size="small" sx={ODDS_CHIP_SX} />
                        <Chip label={rtpLabel ?? "???"} size="small" sx={RTP_CHIP_SX} />
                    </Box>
                </CardContent>
            </Card>

            <Dialog
                fullScreen={fullScreen}
                maxWidth="md"
                fullWidth={!fullScreen}
                open={playing}
                onClose={(_event, reason) => {
                    if (reason !== "backdropClick") {
                        setPlaying(false);
                        onClose?.();
                    }
                }}
                aria-label={title}
                PaperProps={fullBleed ? { sx: { display: "flex", flexDirection: "column" } } : undefined}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        p: 1,
                        flexShrink: 0,
                        bgcolor: "rgba(0,0,0,0.12)",
                        overflow: "hidden",
                    }}
                >
                    <CheddarBalanceChip />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                        {headerActions}
                        <IconButton
                            onClick={() => {
                                setPlaying(false);
                                onClose?.();
                            }}
                            aria-label="Close"
                        >
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>
                <Box sx={fullBleed ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : { p: 1 }}>{children}</Box>
            </Dialog>
        </>
    );
}
