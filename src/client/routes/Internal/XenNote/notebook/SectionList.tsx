import { Box, ListItemButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { NoteColor } from "@shared/xennote/notes";
import { railItemSx } from "../../../../components/ui/railStyles";
import type { XenNoteSection } from "../../../../types/XenNotePage";
import { swatchColor } from "../noteColors";
import SectionOptions from "./SectionOptions";
import { reorderRowSx, useListDrag } from "./useListDrag";

interface SectionListProps {
  sections: XenNoteSection[];
  /** How many non-archived pages each section holds, keyed by section id. */
  pageCounts: ReadonlyMap<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
  canEdit: boolean;
  onRename: (section: XenNoteSection) => void;
  onColor: (section: XenNoteSection, color: NoteColor) => void;
  onDelete: (section: XenNoteSection) => void;
  onReorder: (id: string, position: { before?: string; after?: string }) => void;
  reordering: boolean;
}

export default function SectionList({
  sections,
  pageCounts,
  activeId,
  onSelect,
  canEdit,
  onRename,
  onColor,
  onDelete,
  onReorder,
  reordering,
}: SectionListProps) {
  const theme = useTheme();
  const { listProps, drag, getRowProps } = useListDrag("data-section-row", onReorder);
  const canReorder = canEdit && !reordering && sections.length > 1;

  return (
    <Box component="nav" aria-label="Notebook sections" sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {sections.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.75, py: 0.75 }}>
          No sections yet
        </Typography>
      )}
      <Box {...listProps} sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {sections.map((section) => {
          const color = swatchColor(theme, section.color);
          const dragging = drag?.id === section.id;
          const dropEdge = drag?.target?.id === section.id ? drag.target.edge : undefined;
          return (
            <Box
              key={section.id}
              data-section-row={section.id}
              sx={{
                display: "flex",
                alignItems: "center",
                position: "relative",
                opacity: dragging ? 0.4 : 1,
                ...(dropEdge && {
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    insetInline: 0,
                    [dropEdge === "before" ? "top" : "bottom"]: -3,
                    height: 2,
                    bgcolor: "primary.main",
                    borderRadius: 1,
                    pointerEvents: "none",
                  },
                }),
              }}
            >
              <ListItemButton
                component="button"
                type="button"
                selected={section.id === activeId}
                onClick={() => onSelect(section.id)}
                {...(canReorder && getRowProps(section.id))}
                sx={{
                  ...railItemSx,
                  ...(canReorder && reorderRowSx(dragging)),
                  flexGrow: 1,
                  pr: 0.75,
                  gap: 0.75,
                  minWidth: 0,
                  textAlign: "left",
                }}
              >
                {color && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />}
                <Typography variant="body2" noWrap sx={{ fontWeight: "inherit", flex: 1 }}>
                  {section.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {pageCounts.get(section.id) ?? 0}
                </Typography>
              </ListItemButton>
              {canEdit && (
                <Box sx={{ ml: 0.5, mr: 1, flexShrink: 0, display: "flex" }}>
                  <SectionOptions
                    key={section.id}
                    section={section}
                    onRename={() => onRename(section)}
                    onColor={(next) => onColor(section, next)}
                    onDelete={() => onDelete(section)}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
