import { Breadcrumbs, Link as MuiLink, Typography } from "@mui/material";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { Crumb } from "../../../../types/XenDriveFile";

interface DriveBreadcrumbsProps {
  /** Folders from the top down, ending with the one that is open. Empty at the top level. */
  crumbs: Crumb[];
  /** Where a crumb links to (the top level is `rootTo`). */
  folderTo: (folderId: string) => string;
  rootTo: string;
  rootLabel?: string;
}

/** "My Drive / Docs / Tax": every part but the last is a link back up. */
export default function DriveBreadcrumbs({ crumbs, folderTo, rootTo, rootLabel = "My Drive" }: DriveBreadcrumbsProps) {
  const atRoot = crumbs.length === 0;
  return (
    <Breadcrumbs aria-label="Folder path" maxItems={4} itemsAfterCollapse={2} sx={{ mb: 2 }}>
      {atRoot ? (
        <Typography color="text.primary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <HomeOutlinedIcon fontSize="small" /> {rootLabel}
        </Typography>
      ) : (
        <MuiLink
          component={RouterLink}
          to={rootTo}
          underline="hover"
          color="inherit"
          sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
        >
          <HomeOutlinedIcon fontSize="small" /> {rootLabel}
        </MuiLink>
      )}
      {crumbs.map((c, i) =>
        i === crumbs.length - 1 ? (
          <Typography key={c._id} color="text.primary" noWrap sx={{ maxWidth: 220 }}>
            {c.name}
          </Typography>
        ) : (
          <MuiLink key={c._id} component={RouterLink} to={folderTo(c._id)} underline="hover" color="inherit">
            {c.name}
          </MuiLink>
        ),
      )}
    </Breadcrumbs>
  );
}
