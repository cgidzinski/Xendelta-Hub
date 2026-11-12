import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
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

interface FilterChipProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  /** The value that means "no filter". */
  neutral: T;
  onChange: (v: T) => void;
}

/** A chip that opens a short list: Type, Link. Highlighted while it is narrowing the list. */
export function FilterChip<T extends string>({ label, value, options, neutral, onChange }: FilterChipProps<T>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = value !== neutral;
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Chip
        label={active ? current?.label : label}
        clickable
        variant={active ? "filled" : "outlined"}
        color={active ? "primary" : "default"}
        onClick={(e) => setAnchor(e.currentTarget)}
        // the trailing icon is a clear button while filtering, and an arrow that opens the list otherwise
        onDelete={(e) =>
          active
            ? onChange(neutral)
            : setAnchor((e.currentTarget as HTMLElement).closest(".MuiChip-root") as HTMLElement)
        }
        deleteIcon={active ? <CloseIcon /> : <KeyboardArrowDownIcon />}
        aria-label={`${label} filter`}
      />
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === value}
            onClick={() => {
              onChange(o.value);
              setAnchor(null);
            }}
            sx={{ minWidth: 190 }}
          >
            <ListItemText>{o.label}</ListItemText>
            {o.value === value && (
              <ListItemIcon sx={{ minWidth: 0, ml: 2 }}>
                <CheckIcon fontSize="small" />
              </ListItemIcon>
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

interface SelectionBarProps {
  count: number;
  /** How many of the selected are files (downloads and links only apply to files). */
  fileCount: number;
  onClear: () => void;
  onDownload: () => void;
  onCopyLinks: () => void;
  onDelete: () => void;
}

/** Replaces the toolbar while things are selected: what you can do to all of them. */
export function SelectionBar({ count, fileCount, onClear, onDownload, onCopyLinks, onDelete }: SelectionBarProps) {
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
      <Button color="inherit" startIcon={<LinkIcon />} onClick={onCopyLinks} disabled={fileCount === 0}>
        Copy links
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={onDelete}>
        Delete
      </Button>
    </Box>
  );
}
