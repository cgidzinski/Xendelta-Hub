import { useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import { useWindowFileDrop } from "../lib/useFileDrop";
import { DriveProvider, useDrive } from "./DriveContext";
import DriveRail from "./DriveRail";
import UploadTray from "./UploadTray";

/** What fills the screen while files are dragged over the page. It lets the drag through, so folders can still take a drop. */
function DropOverlay({ show }: { show: boolean }) {
  const { target } = useDrive();
  if (!show) return null;
  return (
    <Box
      aria-hidden
      sx={(t) => ({
        position: "fixed",
        inset: 12,
        zIndex: 1400,
        pointerEvents: "none",
        border: 2,
        borderStyle: "dashed",
        borderColor: "primary.main",
        borderRadius: 3,
        bgcolor: alpha(t.palette.primary.main, 0.1),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        textAlign: "center",
        p: 3,
      })}
    >
      <Box
        sx={(t) => ({
          width: 76,
          height: 76,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "primary.main",
          bgcolor: alpha(t.palette.primary.main, 0.2),
        })}
      >
        <FileUploadOutlinedIcon sx={{ fontSize: 38 }} />
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 500 }}>
        Drop to upload to {target.name}
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 360 }}>
        Drop onto a folder instead to put the files inside it.
      </Typography>
    </Box>
  );
}

function ShellInner() {
  const { add, target } = useDrive();
  const onDrop = useCallback((files: File[]) => add(files, target.folderId), [add, target.folderId]);
  const dragging = useWindowFileDrop(onDrop);
  return (
    <>
      <Outlet />
      <UploadTray />
      <DropOverlay show={dragging} />
    </>
  );
}

/** Wraps every XenDrive page: the upload queue, its tray, and drag-and-drop live here so they survive moving around. */
export function DriveShell() {
  return (
    <DriveProvider>
      <ShellInner />
    </DriveProvider>
  );
}

/** The browsing pages sit beside the sidebar on a computer, and fill the screen on a phone. */
export function DriveBrowseLayout() {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", minHeight: "calc(100vh - 64px)" }}>
      <DriveRail />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
