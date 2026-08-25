import { Box, Tab, Tabs, useMediaQuery, useTheme } from "@mui/material";
import { Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import type { BookDetailContext } from "./BookDetail";
import { SETTINGS_SECTIONS, activeIndex } from "./navigation";

/**
 * Settings is a layout, not a page: eight areas, each its own deep-linkable URL, rather
 * than one very long scroll.
 *
 * It owns no state of its own — every section reads what it needs from the book context,
 * which this route forwards straight through.
 */
export default function BookSettings() {
    // Forwarded verbatim to the sections below. They call useOutletContext expecting the
    // same shape the top-level tabs get, so this must pass through untouched.
    const ctx = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isWide = useMediaQuery(theme.breakpoints.up("md"));

    // Bare /settings redirects to the first section, but until that lands there is no
    // match — fall back to the first rather than leaving the list with nothing selected.
    const matched = activeIndex(location.pathname, SETTINGS_SECTIONS.map((s) => s.path));
    const activeSection = matched === false ? 0 : matched;

    const sectionTabs = (
        <Tabs
            orientation={isWide ? "vertical" : "horizontal"}
            variant={isWide ? "standard" : "scrollable"}
            // "auto" gives arrows on a narrow desktop window, where there is nothing to
            // swipe, and hides them on touch where there is.
            scrollButtons="auto"
            value={activeSection}
            onChange={(_, v) => navigate(SETTINGS_SECTIONS[v].path)}
            sx={isWide
                ? {
                    borderRight: 1,
                    borderColor: "divider",
                    minWidth: 168,
                    flexShrink: 0,
                    "& .MuiTab-root": { alignItems: "flex-start", textAlign: "left", minHeight: 44 },
                }
                : { borderBottom: 1, borderColor: "divider", mb: 2 }}
        >
            {SETTINGS_SECTIONS.map((s) => <Tab key={s.path} label={s.label} />)}
        </Tabs>
    );

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", p: 2 }}>
            <Box sx={{ display: "flex", flexDirection: isWide ? "row" : "column", gap: isWide ? 2 : 0, flex: 1, minHeight: 0 }}>
                {sectionTabs}
                <Box sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, overflowY: "auto", pr: { xs: 0, sm: 3.5 } }}>
                    <Outlet context={ctx} />
                </Box>
            </Box>
        </Box>
    );
}
