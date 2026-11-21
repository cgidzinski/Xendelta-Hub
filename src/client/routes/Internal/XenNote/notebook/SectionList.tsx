import { Box, IconButton, ListItemButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { railItemSx } from "../../../../components/ui/railStyles";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import type { XenNoteSection } from "../../../../types/XenNotePage";
import { swatchColor } from "../noteColors";
import { reorderRowSx, useListDrag } from "./useListDrag";

interface SectionListProps {
  sections: XenNoteSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  canEdit: boolean;
  onAdd: () => void;
  onReorder: (id: string, position: { before?: string; after?: string }) => void;
  reordering: boolean;
}

export default function SectionList({
  sections,
  activeId,
  onSelect,
  canEdit,
  onAdd,
  onReorder,
  reordering,
}: SectionListProps) {
  const theme = useTheme();
  const { listProps, drag, getRowProps } = useListDrag("data-section-row", onReorder);
  const canReorder = canEdit && !reordering && sections.length > 1;

  return (
    <Box component="nav" aria-label="Notebook sections" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.5, minHeight: 32 }}>
        <Typography variant="caption" sx={sectionLabelSx}>
          Sections
        </Typography>
        {canEdit && (
          <Tooltip title="Add a section">
            <IconButton aria-label="Add a section" size="small" onClick={onAdd}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box {...listProps} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
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
                <ChevronRightIcon fontSize="small" />
              </ListItemButton>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
