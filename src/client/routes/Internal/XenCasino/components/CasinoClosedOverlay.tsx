import { useMemo } from "react";
import { Box, Typography, Paper } from "@mui/material";
import { formatCheddar } from "../utils/currency";

// Picked at random once per mount (not per render) - see the useMemo below. Reads the same
// regardless of whether the closure was triggered manually or by the auto-broke check; the
// bank balance line underneath is what actually explains why, when relevant.
const BROKE_MESSAGES = [
    "The house lost the house.",
    "We bet it all on black. Black lost.",
    "Management is currently checking the couch cushions for cheddar.",
    "Turns out \"the house always wins\" was aspirational.",
    "Our accountant fainted. Please hold.",
    "The vault echoes. That's not a good sign.",
    "We may have let the jackpot get a little too jackpot-y.",
    "Somewhere, a pachinko machine is laughing at us.",
];

interface CasinoClosedOverlayProps {
    reason: "manual" | "broke" | null;
    bankBalance: number | null;
}

export default function CasinoClosedOverlay({ reason, bankBalance }: CasinoClosedOverlayProps) {
    const message = useMemo(() => BROKE_MESSAGES[Math.floor(Math.random() * BROKE_MESSAGES.length)], []);

    // Positioned absolute within the routed content area (its parent in XenCasinoLayout is
    // `position: relative`, sized with `minHeight` so it matches that page's actual content
    // height) - not fixed to the viewport, so the app topbar/sidebar and the XenCasino navbar
    // above it stay visible and usable, and the backdrop fully covers however tall that page's
    // content happens to be (a long games list vs. a short game page) rather than stopping
    // short. The games/ledger content underneath stays mounted too (just dimmed through this),
    // rather than being unmounted.
    //
    // The notice card itself is pinned a fixed distance from the top of that backdrop (not
    // vertically centered) - centering would put it far down the page on a tall backdrop,
    // requiring a scroll to see it at all.
    return (
        <Box
            sx={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                backgroundColor: "rgba(10, 5, 15, 0.6)",
                backdropFilter: "blur(1.5px)",
            }}
        >
            <Paper
                elevation={12}
                sx={{
                    position: "absolute",
                    top: { xs: 164, sm: 196 },
                    left: "50%",
                    transform: "translateX(-50%)",
                    maxWidth: 480,
                    width: "calc(100% - 32px)",
                    p: 4,
                    textAlign: "center",
                    border: "1px solid rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(30, 15, 20, 0.92)",
                    backgroundImage: "radial-gradient(circle at 50% 30%, rgba(120,0,40,0.3), transparent 70%)",
                }}
            >
                <Typography variant="overline" sx={{ letterSpacing: 2, color: "error.main", fontWeight: 700 }}>
                    XenCasino Closed
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, mt: 1, mb: 2 }}>
                    {message}
                </Typography>
                {reason === "broke" && bankBalance !== null && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Current bank balance: {formatCheddar(bankBalance)} cheddar. We need at least 1,000,000 to
                        reopen.
                    </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                    Check back later — the tables will be back open once things are sorted out.
                </Typography>
            </Paper>
        </Box>
    );
}
