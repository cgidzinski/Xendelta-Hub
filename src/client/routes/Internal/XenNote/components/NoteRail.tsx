import type { ReactNode } from "react";
import { Box, Button, ListItemButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NotesIcon from "@mui/icons-material/Notes";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import { railItemSx, railNewButtonSx } from "../../../../components/ui/railStyles";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import type { XenNoteCounts, XenNotebook } from "../../../../types/XenNote";
import { swatchColor } from "../noteColors";

/** Which notes are showing: everything, my private notes, one notebook, or the archive. */
export type Scope = "all" | "none" | "archive" | string;

interface NoteRailProps {
  scope: Scope;
  onScope: (scope: Scope) => void;
  counts?: XenNoteCounts;
  notebooks: XenNotebook[];
  labels: Array<{ name: string; count: number }>;
  label: string | null;
  onLabel: (label: string | null) => void;
  onNewNotebook: () => void;
  /** Start a note in whatever is open; omitted when the open view can't take new notes (archive, read-only). */
  onNewNote?: () => void;
}

/** One row of the rail: icon, name, and a count on the right. */
function RailRow({
  icon,
  text,
  count,
  selected,
  onClick,
  accent,
}: {
  icon: ReactNode;
  text: string;
  count?: number;
  selected?: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={accent ? { ...railItemSx, color: "primary.main" } : railItemSx}
    >
      <Box sx={{ display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>{icon}</Box>
      <Typography variant="body2" noWrap sx={{ flex: 1, color: "inherit", fontWeight: "inherit", fontSize: "inherit" }}>
        {text}
      </Typography>
      {count !== undefined && (
        <Typography variant="caption" color="text.secondary">
          {count}
        </Typography>
      )}
    </ListItemButton>
  );
}

const sectionSx = { ...sectionLabelSx, px: 1.75, pt: 1.75, pb: 0.75 };

/** The left rail: a New note button, where to look (all, mine, notebooks, labels) and the archive at the foot. */
export default function NoteRail({
  scope,
  onScope,
  counts,
  notebooks,
  labels,
  label,
  onLabel,
  onNewNotebook,
  onNewNote,
}: NoteRailProps) {
  const theme = useTheme();
  return (
    <Box
      component="nav"
      aria-label="Notes navigation"
      sx={{ display: "flex", flexDirection: "column", gap: 0.75, flex: 1, minHeight: 0 }}
    >
      {onNewNote && (
        <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={onNewNote} sx={railNewButtonSx}>
          New note
        </Button>
      )}

      <RailRow
        icon={<NotesIcon />}
        text="All notes"
        count={counts?.all}
        selected={scope === "all"}
        onClick={() => onScope("all")}
      />
      <RailRow
        icon={<LockOutlinedIcon />}
        text="My notes"
        count={counts?.mine}
        selected={scope === "none"}
        onClick={() => onScope("none")}
      />

      <Typography variant="caption" sx={sectionSx}>
        Notebooks
      </Typography>
      {notebooks.map((b) => {
        const main = swatchColor(theme, b.color);
        return (
          <RailRow
            key={b._id}
            icon={
              main ? (
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: main }} />
              ) : (
                <MenuBookOutlinedIcon />
              )
            }
            text={b.name}
            count={b.note_count}
            selected={scope === b._id}
            onClick={() => onScope(b._id)}
          />
        );
      })}
      <RailRow icon={<AddIcon />} text="New notebook" accent onClick={onNewNotebook} />

      {labels.length > 0 && (
        <>
          <Typography variant="caption" sx={sectionSx}>
            Labels
          </Typography>
          {labels.map((l) => (
            <RailRow
              key={l.name}
              icon={<LabelOutlinedIcon />}
              text={l.name}
              count={l.count}
              selected={label?.toLowerCase() === l.name.toLowerCase()}
              onClick={() => onLabel(label?.toLowerCase() === l.name.toLowerCase() ? null : l.name)}
            />
          ))}
        </>
      )}

      <Box sx={{ flex: 1, minHeight: 20 }} />
      <RailRow
        icon={<ArchiveOutlinedIcon />}
        text="Archive"
        count={counts?.archived}
        selected={scope === "archive"}
        onClick={() => onScope("archive")}
      />
    </Box>
  );
}
