import {
  Box,
  Button,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import LinkIcon from "@mui/icons-material/Link";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";

export type DriveViewMode = "list" | "grid";

/** Switch between the list and the grid. */
export function ViewToggle({ value, onChange }: { value: DriveViewMode; onChange: (v: DriveViewMode) => void }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_, v: DriveViewMode | null) => v && onChange(v)}
      aria-label="View"
    >
      <ToggleButton value="list" aria-label="List view">
        <ViewListIcon fontSize="small" />
      </ToggleButton>
      <ToggleButton value="grid" aria-label="Grid view">
        <ViewModuleIcon fontSize="small" />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  sx?: SxProps<Theme>;
}

/**
 * A boxed field that opens a short list (Type, Link), like XenBudget's Source. Fields sit side by side and share the row
 * on a phone: they shrink, and a long choice ellipsises instead of pushing the page sideways.
 */
export function FilterSelect<T extends string>({ label, value, options, onChange, sx }: FilterSelectProps<T>) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      sx={[{ minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

interface SelectionBarProps {
  count: number;
  /** How many of the selected are files (downloads only apply to files). */
  fileCount: number;
  /** How many can have a public link (not the files an app stored). */
  linkCount: number;
  onClear: () => void;
  onDownload: () => void;
  onCopyLinks: () => void;
  onDelete: () => void;
}

/** Replaces the toolbar while things are selected: what you can do to all of them. */
export function SelectionBar({
  count,
  fileCount,
  linkCount,
  onClear,
  onDownload,
  onCopyLinks,
  onDelete,
}: SelectionBarProps) {
  return (
    <Box
      role="toolbar"
      aria-label="Selection"
      sx={(t) => ({
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        minHeight: 48,
        pl: 1,
        pr: 1.5,
        mb: 1,
        borderRadius: 2.5,
        border: 1,
        borderColor: alpha(t.palette.primary.main, 0.4),
        bgcolor: alpha(t.palette.primary.main, 0.14),
        flexWrap: "wrap",
      })}
    >
      <IconButton aria-label="Clear selection" onClick={onClear} color="primary">
        <CloseIcon />
      </IconButton>
      <Typography sx={{ fontWeight: 500, mr: 1.5 }}>{count} selected</Typography>
      <Button color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={onDownload} disabled={fileCount === 0}>
        Download
      </Button>
      <Button color="inherit" startIcon={<LinkIcon />} onClick={onCopyLinks} disabled={linkCount === 0}>
        Copy links
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={onDelete}>
        Delete
      </Button>
    </Box>
  );
}
