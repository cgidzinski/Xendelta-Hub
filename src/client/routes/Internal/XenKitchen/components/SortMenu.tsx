import { useState } from "react";
import { Button, Menu, MenuItem, Typography } from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { KITCHEN_SORTS, type KitchenSort } from "@shared/xenkitchen/kitchen";
import { SORT_LABELS } from "./FilterPanel";

interface SortMenuProps {
  value: KitchenSort;
  onChange: (sort: KitchenSort) => void;
}

/** "Sort  Recently updated ▾", next to Filters. On a phone the same choice is inside the Filters sheet. */
export default function SortMenu({ value, onChange }: SortMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        aria-haspopup="menu"
        aria-label={`Sort: ${SORT_LABELS[value]}`}
        endIcon={<ArrowDropDownIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ height: 44, whiteSpace: "nowrap", borderColor: "divider", fontWeight: 400 }}
      >
        <Typography component="span" color="text.secondary" sx={{ mr: 1 }}>
          Sort
        </Typography>
        <Typography component="span" sx={{ fontWeight: 500 }}>
          {SORT_LABELS[value]}
        </Typography>
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {KITCHEN_SORTS.map((s) => (
          <MenuItem
            key={s}
            selected={s === value}
            onClick={() => {
              setAnchor(null);
              onChange(s);
            }}
          >
            {SORT_LABELS[s]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
