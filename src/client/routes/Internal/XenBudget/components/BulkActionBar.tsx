import { useState } from "react";
import { Box, Button, Menu, MenuItem, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { cardSx } from "../../../../components/ui/surfaceStyles";

interface BulkActionBarProps {
  count: number;
  categories: XenBudgetLabel[];
  flags: XenBudgetLabel[];
  busy: boolean;
  onSetCategory: (name: string) => void;
  onAddFlag: (name: string) => void;
  onRemoveFlag: (name: string) => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onDone: () => void;
}

type Open = "category" | "addFlag" | "removeFlag" | null;

/** What can be done to the ticked items: put them in a category, add or take off a flag, or delete them. */
export default function BulkActionBar(props: BulkActionBarProps) {
  const { count, categories, flags, busy, onSetCategory, onAddFlag, onRemoveFlag, onDelete, onSelectAll, onDone } =
    props;
  const [menu, setMenu] = useState<{ kind: Exclude<Open, null>; anchor: HTMLElement } | null>(null);
  const open = (kind: Exclude<Open, null>) => (e: React.MouseEvent<HTMLElement>) =>
    setMenu({ kind, anchor: e.currentTarget });
  const list = menu?.kind === "category" ? categories : flags;
  const choose = (name: string) => {
    if (menu?.kind === "category") onSetCategory(name);
    else if (menu?.kind === "addFlag") onAddFlag(name);
    else onRemoveFlag(name);
    setMenu(null);
  };

  return (
    <Box
      role="toolbar"
      aria-label="Actions for selected items"
      sx={{ ...cardSx, display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", px: 1.5, py: 1 }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
        {count} selected
      </Typography>
      <Button size="small" onClick={onSelectAll} disabled={busy}>
        Select all
      </Button>
      <Button size="small" onClick={open("category")} disabled={busy || count === 0 || categories.length === 0}>
        Category
      </Button>
      <Button size="small" onClick={open("addFlag")} disabled={busy || count === 0 || flags.length === 0}>
        Add flag
      </Button>
      <Button size="small" onClick={open("removeFlag")} disabled={busy || count === 0 || flags.length === 0}>
        Remove flag
      </Button>
      <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={onDelete} disabled={busy || count === 0}>
        Delete
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button size="small" onClick={onDone}>
        Done
      </Button>
      <Menu open={!!menu} anchorEl={menu?.anchor} onClose={() => setMenu(null)}>
        {list.map((l) => (
          <MenuItem key={l.name} onClick={() => choose(l.name)}>
            {l.name}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
