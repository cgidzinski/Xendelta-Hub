import { ReactNode, useEffect, useState } from "react";
import { Box, Button, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import OddsDisplay, { OddsRow } from "./OddsDisplay";
import { useXenCasinoTitlebar } from "../context/XenCasinoTitlebarContext";

export interface OddsSection {
    title?: string;
    rows: OddsRow[];
    footnote?: string;
}

interface GameWrapperProps {
    title: string;
    oddsLabel?: string;
    howToPlay: ReactNode;
    oddsSections: OddsSection[];
    children: ReactNode;
}

/**
 * The required shell for every XenCasino game. Name, odds badge, and the help button live
 * in the shared XenCasinoNavbar, not here - this component just registers them there for
 * as long as the game page is mounted (via context, since the navbar renders outside this
 * page in XenCasinoLayout), and owns the help modal itself since only the game page has
 * its own odds data. The "Back to Games" control stays here in the page body. Every new
 * game variant (more scratch tickets, more slots) should be built as `children` inside
 * this wrapper rather than reinventing any of this chrome.
 */
export default function GameWrapper({ title, oddsLabel, howToPlay, oddsSections, children }: GameWrapperProps) {
    const navigate = useNavigate();
    const [helpOpen, setHelpOpen] = useState(false);
    const { setTitlebar } = useXenCasinoTitlebar();

    useEffect(() => {
        setTitlebar({ title, oddsLabel, onOpenHelp: () => setHelpOpen(true) });
        return () => setTitlebar(null);
    }, [title, oddsLabel, setTitlebar]);

    return (
        <Box>
            <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate("/internal/xencasino")}
                sx={{ mb: 3 }}
            >
                Back to Games
            </Button>

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
