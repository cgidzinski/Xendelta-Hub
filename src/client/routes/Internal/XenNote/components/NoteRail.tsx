import { Box, Button, Chip, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NotesIcon from "@mui/icons-material/Notes";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
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
}

/** The left rail: where to look (all, mine, each notebook, archive) and the label filter. */
export default function NoteRail({
  scope,
  onScope,
  counts,
  notebooks,
  labels,
  label,
  onLabel,
  onNewNotebook,
}: NoteRailProps) {
  const theme = useTheme();
  const row = (
    key: string,
    icon: React.ReactNode,
    text: string,
    count: number | undefined,
    selected: boolean,
    onClick: () => void,
  ) => (
    <ListItemButton key={key} selected={selected} onClick={onClick} sx={{ borderRadius: 2, minHeight: 40 }}>
      <ListItemIcon sx={{ minWidth: 34 }}>{icon}</ListItemIcon>
      <ListItemText primary={text} slotProps={{ primary: { noWrap: true } }} />
      {count !== undefined && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {count}
        </Typography>
      )}
    </ListItemButton>
  );

  return (
    <Box component="nav" aria-label="Notes navigation" sx={{ width: "100%" }}>
      <List dense disablePadding>
        {row("all", <NotesIcon fontSize="small" />, "All notes", counts?.all, scope === "all", () => onScope("all"))}
        {row("none", <LockOutlinedIcon fontSize="small" />, "My notes", counts?.mine, scope === "none", () =>
          onScope("none"),
        )}
      </List>

      <Typography variant="caption" sx={{ ...sectionLabelSx, mt: 2, mb: 0.5, px: 1.5 }}>
        Notebooks
      </Typography>
      <List dense disablePadding>
        {notebooks.map((b) => {
          const main = swatchColor(theme, b.color);
          return row(
            b._id,
            main ? (
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: main, ml: 0.5 }} />
            ) : (
              <MenuBookOutlinedIcon fontSize="small" />
            ),
            b.name,
            b.note_count,
            scope === b._id,
            () => onScope(b._id),
          );
        })}
      </List>
      <Button size="small" startIcon={<AddIcon />} onClick={onNewNotebook} sx={{ mt: 0.5, ml: 0.5 }}>
        New notebook
      </Button>

      <List dense disablePadding sx={{ mt: 2 }}>
        {row(
          "archive",
          <ArchiveOutlinedIcon fontSize="small" />,
          "Archive",
          counts?.archived,
          scope === "archive",
          () => onScope("archive"),
        )}
      </List>

      {labels.length > 0 && (
        <>
          <Typography variant="caption" sx={{ ...sectionLabelSx, mt: 2, mb: 1, px: 1.5 }}>
            Labels
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 1 }}>
            {labels.map((l) => {
              const on = label?.toLowerCase() === l.name.toLowerCase();
              return (
                <Chip
                  key={l.name}
                  size="small"
                  icon={<LabelOutlinedIcon />}
                  label={l.name}
                  color={on ? "primary" : "default"}
                  variant={on ? "filled" : "outlined"}
                  onClick={() => onLabel(on ? null : l.name)}
                />
              );
            })}
          </Box>
        </>
      )}
    </Box>
  );
}
