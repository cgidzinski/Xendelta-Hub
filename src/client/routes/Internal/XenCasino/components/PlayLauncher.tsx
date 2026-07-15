import { ReactNode, useState } from "react";
import { Box, Button, Dialog, IconButton, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface PlayLauncherProps {
    preview: ReactNode; // dimmed/blurred idle visual shown before playing
    startLabel?: string;
    headerActions?: ReactNode; // extra controls in the top bar, left of the close X
    fullBleed?: boolean; // edge-to-edge content (no padding), fills the dialog entirely
    children: ReactNode; // rendered inside the modal once open
}

/**
 * The reusable "click Start, a modal opens" shell every game page uses: a dimmed preview
 * with a centered start button, and a Dialog (fullScreen on mobile, md on desktop) with a
 * top bar hosting the close X (plus any game-specific `headerActions`, e.g. Scratch's Check
 * Ticket) that hosts the actual game component (SlotMachine, ScratchCard, ...). Knows
 * nothing about what's being played - just opens/closes and renders children.
 */
export default function PlayLauncher({ preview, startLabel = "Start Playing", headerActions, fullBleed, children }: PlayLauncherProps) {
    const [playing, setPlaying] = useState(false);
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

    return (
        <>
            <Box sx={{ position: "relative", maxWidth: 480, mx: "auto" }}>
                <Box sx={{ opacity: 0.45, filter: "blur(1px)", pointerEvents: "none" }}>{preview}</Box>
                <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Button
                        variant="contained"
                        color="warning"
                        size="large"
                        onClick={() => setPlaying(true)}
                        sx={{ borderRadius: 999, px: 5, py: 1.5, fontWeight: 800 }}
                    >
                        {startLabel}
                    </Button>
                </Box>
            </Box>

            <Dialog
                fullScreen={fullScreen}
                maxWidth="md"
                fullWidth={!fullScreen}
                open={playing}
                onClose={() => setPlaying(false)}
                PaperProps={fullBleed ? { sx: { display: "flex", flexDirection: "column" } } : undefined}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: headerActions ? "space-between" : "flex-end",
                        gap: 1,
                        p: 1,
                        flexShrink: 0,
                    }}
                >
                    {headerActions}
                    <IconButton onClick={() => setPlaying(false)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Box sx={fullBleed ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : { px: 3, pb: 4 }}>{children}</Box>
            </Dialog>
        </>
    );
}
