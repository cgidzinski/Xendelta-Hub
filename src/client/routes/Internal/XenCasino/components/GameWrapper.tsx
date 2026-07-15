import { ReactNode, useEffect } from "react";
import { Box, Button, Typography, Paper } from "@mui/material";
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
    howToPlay: ReactNode;
    oddsSections: OddsSection[];
    children: ReactNode;
}

/**
 * The required shell for every XenCasino game. Name lives in the shared XenCasinoNavbar,
 * not here - this component just registers it there for as long as the game page is
 * mounted (via context, since the navbar renders outside this page in XenCasinoLayout). The
 * odds ratio itself is shown under the Start Playing button (see PlayLauncher), not in the
 * navbar. "How to Play" and the odds/paytable breakdown render inline, directly under the
 * game, rather than behind a help modal. The "Back to Games" control stays here in the page
 * body. Every new game variant (more scratch tickets, more slots) should be built as
 * `children` inside this wrapper rather than reinventing any of this chrome.
 */
export default function GameWrapper({ title, howToPlay, oddsSections, children }: GameWrapperProps) {
    const navigate = useNavigate();
    const { setTitlebar } = useXenCasinoTitlebar();

    useEffect(() => {
        setTitlebar({ title });
        return () => setTitlebar(null);
    }, [title, setTitlebar]);

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

            <Paper variant="outlined" sx={{ p: 3, mt: 4 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                    How to Play
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {howToPlay}
                </Typography>
                {oddsSections.map((section, i) => (
                    <OddsDisplay key={i} title={section.title} rows={section.rows} footnote={section.footnote} />
                ))}
            </Paper>
        </Box>
    );
}
