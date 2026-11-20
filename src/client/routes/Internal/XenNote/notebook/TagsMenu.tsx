import { useState } from "react";
import { Button, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import TagIcon from "@mui/icons-material/Tag";

interface TagsMenuProps {
  /** Each tag in the notebook with how many pages use it. */
  tags: Array<{ tag: string; count: number }>;
  onOpen: (tag: string) => void;
}

/** A button listing the notebook's tags; choosing one opens its page. Hidden when there are none. */
export default function TagsMenu({ tags, onOpen }: TagsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (tags.length === 0) return null;
  return (
    <>
      <Button size="small" color="inherit" startIcon={<TagIcon />} onClick={(e) => setAnchor(e.currentTarget)}>
        Tags
      </Button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        {tags.map(({ tag, count }) => (
          <MenuItem
            key={tag}
            onClick={() => {
              setAnchor(null);
              onOpen(tag);
            }}
          >
            <ListItemText>#{tag}</ListItemText>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 3 }}>
              {count}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
