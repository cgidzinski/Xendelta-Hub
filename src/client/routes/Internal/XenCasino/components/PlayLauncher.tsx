import { ReactNode, useState } from "react";
import { Box, Button, Chip, Dialog, IconButton, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheddarBalanceChip from "./CheddarBalanceChip";

const ODDS_CHIP_SX = {
    color: "warning.main",
    bgcolor: "rgba(255, 167, 38, 0.12)",
    border: "1px solid rgba(255, 167, 38, 0.3)",
    fontWeight: 700,
} as const;

interface PlayLauncherProps {
    title?: string; // the game's name, shown centered in the top bar
    oddsLabel?: string; // e.g. "1:2.97" - shown under the Start Playing button
    rtpLabel?: string; // e.g. "RTP 95.2%" - shown beside oddsLabel, always
    startLabel?: string;
    onOpen?: () => void; // fires right as the modal opens - lets the game reset a finished round first
    onClose?: () => void; // fires right as the modal closes (X button or Escape, not a backdrop click) - lets a game settle up (e.g. Pachinko cashing out) on the way out
    headerActions?: ReactNode; // extra controls in the top bar, right of the balance, left of the close X
    fullBleed?: boolean; // edge-to-edge content (no padding), fills the dialog entirely
    children: ReactNode; // rendered inside the modal once open
}

/**
 * The reusable "click Start, a modal opens" shell every game page uses: a plain centered
 * start button (no background art - keep the idle state simple) with the odds ratio shown
 * just underneath it, and a Dialog (fullScreen on mobile, md on desktop) with a top bar. The
 * outer XenCasinoNavbar (its balance chip) is hidden behind this modal, so the top bar carries
 * its own copy: cheddar balance on the left, and the close X (plus any game-specific
 * `headerActions`, e.g. Scratch's Check Ticket) on the right, on a slightly darker bar than
 * the rest of the dialog to set it apart. `title` is kept only as the dialog's accessible
 * name (`aria-label`) - it's deliberately not shown visually, the game is already obvious from
 * context once the modal is open. Below
 * that, the actual game component (SlotMachine, ScratchCard, ...) - this component knows
 * nothing about what's being played, just opens/closes and renders children. `onOpen` fires
 * every time the modal opens (not just the first time) - games whose finished state lives
 * outside the modal-scoped subtree (e.g. a scratch ticket's `result`/`checked`, which live in
 * the page component so the header's Check Ticket button can reach them) use it to reset a
 * finished round back to idle, since simply closing and reopening the dialog wouldn't do that
 * on its own.
 */
export default function PlayLauncher({ title, oddsLabel, rtpLabel, startLabel = "Start Playing", onOpen, onClose, headerActions, fullBleed, children }: PlayLauncherProps) {
    const [playing, setPlaying] = useState(false);
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

    return (
        <>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 6 }}>
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
                {(oddsLabel || rtpLabel) && (
                    <Box sx={{ display: "flex", gap: 1 }}>
                        {oddsLabel && <Chip label={oddsLabel} size="small" sx={ODDS_CHIP_SX} />}
                        {rtpLabel && <Chip label={rtpLabel} size="small" sx={ODDS_CHIP_SX} />}
                    </Box>
                )}
            </Box>

            <Dialog
                fullScreen={fullScreen}
                maxWidth="md"
                fullWidth={!fullScreen}
                open={playing}
                // Only the X (or Escape) closes this - a stray backdrop click mid-scratch/spin
                // shouldn't dismiss the game, so backdropClick is explicitly ignored here.
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
