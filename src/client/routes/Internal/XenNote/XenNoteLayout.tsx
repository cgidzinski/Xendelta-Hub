import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Box, Drawer, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { railPanelSx } from "../../../components/ui/railStyles";
import { useAuth } from "../../../contexts/AuthContext";
import NoteRail from "./components/NoteRail";
import NotebookDialog from "./components/NotebookDialog";

export default function XenNoteLayout() {
  const { user } = useAuth();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const [railOpen, setRailOpen] = useState(false);
  const [newNotebookOpen, setNewNotebookOpen] = useState(false);
  const rail = (
    <NoteRail
      key={user.id}
      userId={user.id}
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
        <Outlet context={() => setRailOpen(true)} />
      </Box>
      {newNotebookOpen && <NotebookDialog open notebook={null} onClose={() => setNewNotebookOpen(false)} />}
    </Box>
  );
}
