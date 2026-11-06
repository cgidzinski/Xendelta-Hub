import { useState } from "react";
import {
  Avatar, AvatarGroup, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, ListItemIcon,
  ListItemText, Menu, MenuItem, TextField, Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import { useSnackbar } from "notistack";
import { useCreateKitchenBook, type KitchenBook } from "../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView } from "./kitchenIcons";

export function MemberAvatars({ book, size = 22 }: { book: KitchenBook; size?: number }) {
  if (book.members.length < 2) return null;
  return (
    <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: size, height: size, fontSize: size * 0.5 } }}>
      {book.members.map((m) => <Avatar key={m.user_id} src={m.avatar || undefined} alt={m.username}>{m.username[0]?.toUpperCase()}</Avatar>)}
    </AvatarGroup>
  );
}

interface Props {
  books: KitchenBook[];
  /** Book id, or "all". */
  value: string;
  onChange: (id: string) => void;
}

/** The header title doubles as the book picker: "My recipes ▾". */
export default function BookSwitcher({ books, value, onChange }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const create = useCreateKitchenBook();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const current = books.find((b) => b._id === value);
  const total = books.reduce((n, b) => n + b.item_count, 0);

  const pick = (id: string) => { setAnchor(null); onChange(id); };

  const createBook = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      const { book } = await create.mutateAsync({ name: n });
      setNewOpen(false);
      setName("");
      onChange(book._id);
      enqueueSnackbar("Book created — add people from Share", { variant: "success" });
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message ?? "Couldn't create the book", { variant: "error" });
    }
  };

  return (
    <>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        color="inherit"
        endIcon={<ExpandMoreIcon />}
        sx={{ textTransform: "none", px: 1, ml: -1, borderRadius: 2, minWidth: 0, maxWidth: "100%" }}
        aria-label="Switch recipe book"
      >
        {current ? (
          <CategoryIconView icon={current.icon} sx={{ color: current.color, mr: 1, fontSize: 28 }} />
        ) : (
          <LibraryBooksIcon sx={{ mr: 1, fontSize: 28, opacity: 0.8 }} />
        )}
        <Typography variant="h5" component="span" sx={{ fontWeight: 800 }} noWrap>{current?.name ?? "All books"}</Typography>
      </Button>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 280, borderRadius: 2 } } }}>
        <MenuItem selected={value === "all"} onClick={() => pick("all")}>
          <ListItemIcon><LibraryBooksIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="All books" secondary={`${total} items across ${books.length} book${books.length === 1 ? "" : "s"}`} />
        </MenuItem>
        <Divider />
        {books.map((b) => (
          <MenuItem key={b._id} selected={value === b._id} onClick={() => pick(b._id)} sx={{ gap: 1 }}>
            <ListItemIcon>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: alpha(b.color, 0.2), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CategoryIconView icon={b.icon} sx={{ fontSize: 18, color: b.color }} />
              </Box>
            </ListItemIcon>
            <ListItemText
              primary={b.name}
              secondary={`${b.item_count} item${b.item_count === 1 ? "" : "s"}${b.my_role === "viewer" ? " · view only" : ""}${b.members.length > 1 ? ` · ${b.members.length} people` : ""}`}
            />
            <MemberAvatars book={b} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); setNewOpen(true); }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="New book…" secondary="e.g. a shared household book" />
        </MenuItem>
      </Menu>

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>New recipe book</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Books are how you share: add people to a book and everything in it — including recipes added later — is shared with them.
          </Typography>
          <TextField autoFocus fullWidth label="Name" placeholder="e.g. Home" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createBook(); }} slotProps={{ htmlInput: { maxLength: 60 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim() || create.isPending} onClick={createBook}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
