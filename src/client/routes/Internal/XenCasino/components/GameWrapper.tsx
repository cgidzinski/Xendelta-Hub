import { ReactNode, useEffect, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Tab, Tabs, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OddsDisplay, { OddsRow } from "./OddsDisplay";
import { useXenCasinoTitlebar } from "../context/XenCasinoTitlebarContext";
import { formatCheddar } from "../utils/currency";

export interface OddsSection {
    title?: string;
    rows: OddsRow[];
    footnote?: string;
}

export interface HelpTab {
    label: string;
    content: ReactNode;
}

interface GameWrapperProps {
    title: string;
    howToPlay: ReactNode;
    helpTabs?: HelpTab[];
    oddsSections: OddsSection[];
    maxWin?: number;
    children: ReactNode;
}

/**
 * The required shell for every XenCasino game. Name lives in the shared XenCasinoNavbar,
 * not here - this component just registers it there for as long as the game page is
 * mounted (via context, since the navbar renders outside this page in XenCasinoLayout). The
 * odds ratio itself is shown under the Start Playing button (see PlayLauncher), not in the
 * navbar. "How to Play" and the odds/paytable breakdown render in a collapsible accordion
 * directly under the game, rather than behind a separate help modal. The "Back to Games"
 * control stays here in the page body. Every new game variant (more scratch tickets, more
 * slots) should be built as `children` inside this wrapper rather than reinventing any of
 * this chrome.
 */
export default function GameWrapper({ title, howToPlay, helpTabs, oddsSections, maxWin, children }: GameWrapperProps) {
    const [infoOpen, setInfoOpen] = useState(false);
    const [tab, setTab] = useState(0);
    const { setTitlebar } = useXenCasinoTitlebar();
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

    useEffect(() => {
        setTitlebar({ title, onInfoClick: () => setInfoOpen(true) });
        return () => setTitlebar(null);
    }, [title, setTitlebar]);

    return (
        <Box sx={{ position: "relative" }}>
            {children}

            <Dialog
                open={infoOpen}
                onClose={() => setInfoOpen(false)}
                fullScreen={fullScreen}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
                        How to Play
                    </Typography>
                    <IconButton onClick={() => setInfoOpen(false)} aria-label="Close" size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {helpTabs ? (
                        <>
                            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
                                {helpTabs.map((t, i) => (
                                    <Tab key={i} label={t.label} />
                                ))}
                            </Tabs>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                {helpTabs[tab]?.content}
                            </Typography>
                        </>
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {howToPlay}
                        </Typography>
                    )}
                    {maxWin !== undefined && (
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 2, color: "success.main" }}>
                            Max win: {formatCheddar(maxWin)}
                        </Typography>
                    )}
                    {oddsSections.map((section, i) => (
                        <OddsDisplay key={i} title={section.title} rows={section.rows} footnote={section.footnote} />
                    ))}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
