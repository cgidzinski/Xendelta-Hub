import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Box, Drawer, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { railPanelSx } from "../../../components/ui/railStyles";
import { useAuth } from "../../../contexts/AuthContext";
import NoteRail from "./components/NoteRail";
import NotebookDialog from "./components/NotebookDialog";
import XenNoteSearchResults from "./components/XenNoteSearchResults";
import { XenNoteSearchProvider, useXenNoteSearch } from "./searchContext";

export default function XenNoteLayout() {
  return (
    <XenNoteSearchProvider>
      <XenNoteLayoutContent />
    </XenNoteSearchProvider>
  );
}

function XenNoteLayoutContent() {
  const { user } = useAuth();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const [railOpen, setRailOpen] = useState(false);
  const [newNotebookOpen, setNewNotebookOpen] = useState(false);
  const { query } = useXenNoteSearch();
  const searching = query.trim().length >= 2;

  // On a phone the rail is a drawer over the results: close it once there is something to search for.
  useEffect(() => {
    if (!wide && searching) setRailOpen(false);
  }, [wide, searching]);

  const rail = (
    <NoteRail
      key={user.id}
      userId={user.id}
      // A phone drawer shows notebooks as a tree: open one to its sections, a section to its pages.
      variant={wide ? "list" : "tree"}
      onNavigate={() => setRailOpen(false)}
      onNewNotebook={() => {
        setRailOpen(false);
        setNewNotebookOpen(true);
      }}
    />
  );

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", minHeight: "calc(100dvh - 64px)" }}>
      {wide ? (
        <Box sx={{ ...railPanelSx, minHeight: 0, height: "calc(100dvh - 64px)" }}>{rail}</Box>
      ) : (
        <Drawer
          open={railOpen}
          onClose={() => setRailOpen(false)}
          slotProps={{ paper: { sx: { width: 280, p: 1.5, pt: 9, overflow: "hidden" } } }}
        >
          {rail}
        </Drawer>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {searching ? <XenNoteSearchResults /> : <Outlet context={() => setRailOpen(true)} />}
      </Box>
      {newNotebookOpen && <NotebookDialog open notebook={null} onClose={() => setNewNotebookOpen(false)} />}
    </Box>
  );
}
