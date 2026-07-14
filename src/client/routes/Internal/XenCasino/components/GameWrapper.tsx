import { ReactNode, useState } from "react";
import { Box, Button, IconButton, Stack, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useNavigate } from "react-router-dom";
import OddsDisplay, { OddsRow } from "./OddsDisplay";

export interface OddsSection {
    title?: string;
    rows: OddsRow[];
    footnote?: string;
}

interface GameWrapperProps {
    title: string;
    howToPlay: ReactNode;
    oddsSections: OddsSection[];
    children: ReactNode;
}

/**
 * The required shell for every XenCasino game - title, back button, and a help button
 * that opens a modal with how-to-play text and the odds. Purely presentational: each
 * game's own hook still owns fetching its odds data, this just renders whatever's handed
 * to it. Every new game variant (more scratch tickets, more slots) should be built as
 * `children` inside this wrapper rather than reinventing the header/help chrome.
 */
export default function GameWrapper({ title, howToPlay, oddsSections, children }: GameWrapperProps) {
    const navigate = useNavigate();
    const [helpOpen, setHelpOpen] = useState(false);

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/internal/xencasino")}>
                    Back to Games
                </Button>
                <IconButton onClick={() => setHelpOpen(true)} aria-label="How to play">
                    <HelpOutlineIcon />
                </IconButton>
            </Stack>

            <Typography variant="h5" sx={{ fontWeight: 700, textAlign: "center", mb: 2 }}>
                {title}
            </Typography>

            {children}

            <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{title} — How to Play</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {howToPlay}
                    </Typography>
                    {oddsSections.map((section, i) => (
                        <OddsDisplay key={i} title={section.title} rows={section.rows} footnote={section.footnote} />
                    ))}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setHelpOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
