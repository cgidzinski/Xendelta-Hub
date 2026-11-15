import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import LinkIcon from "@mui/icons-material/Link";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { useXendriveRecent } from "../../../../hooks/xendrive/useXendrive";
import BillingSummary from "../../../../components/billing/BillingSummary";
import { railItemSx, railNewButtonSx, railPanelSx } from "../../../../components/ui/railStyles";
import { XENDRIVE_ROOT } from "../paths";
import NewMenu from "./NewMenu";

/** The sidebar: New, the three ways of looking at the drive, and how much space is used. */
export default function DriveRail() {
  const { profile } = useUserProfile();
  const { data: recent } = useXendriveRecent();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const usage = profile?.xendrive;

  return (
    <Box component="nav" aria-label="Drive" sx={{ ...railPanelSx, display: { xs: "none", md: "flex" } }}>
      <Button
        variant="contained"
        size="large"
        startIcon={<AddIcon />}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        sx={railNewButtonSx}
      >
        New
      </Button>
      <NewMenu anchorEl={menuAnchor} onClose={() => setMenuAnchor(null)} />

      <Box component={NavLink} to={XENDRIVE_ROOT} end sx={railItemSx}>
        <FolderOutlinedIcon fontSize="small" />
        My Drive
      </Box>
      <Box component={NavLink} to={`${XENDRIVE_ROOT}/shared`} sx={railItemSx}>
        <LinkIcon fontSize="small" />
        Shared links
        {!!recent?.sharedCount && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
            {recent.sharedCount}
          </Typography>
        )}
      </Box>
      <Box component={NavLink} to={`${XENDRIVE_ROOT}/recent`} sx={railItemSx}>
        <ScheduleIcon fontSize="small" />
        Recent
      </Box>

      <Box sx={{ flex: 1 }} />

      {usage && (
        <Box sx={{ p: 1.75, border: 1, borderColor: "divider", borderRadius: 2.5 }}>
          <BillingSummary stored={usage} />
        </Box>
      )}
    </Box>
  );
}
