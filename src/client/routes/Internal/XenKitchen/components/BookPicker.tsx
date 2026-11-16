import { useEffect, useState } from "react";
import { Box, Button, ButtonBase, Collapse, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { RADIUS } from "../../../../theme";
import { useUploadProgress } from "../../../../hooks/useUploadProgress";
import {
  useCreateKitchenBook,
  useSetKitchenBookCover,
  type KitchenBook,
} from "../../../../hooks/xenkitchen/useKitchen";
import BookCover from "./BookCover";
import CoverField from "./CoverField";
import { CategoryIconView } from "./kitchenIcons";

const TILE = 72;

interface TriggerProps {
  books: KitchenBook[];
  /** Book id, or "all". */
  value: string;
  open: boolean;
  onToggle: () => void;
}

/** The page title, which doubles as the button that opens the book picker: "Home ▾". */
export function BookPickerButton({ books, value, open, onToggle }: TriggerProps) {
  const current = books.find((b) => b._id === value);
  return (
    <Button
      onClick={onToggle}
      color="inherit"
      endIcon={<ExpandMoreIcon sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />}
      sx={{ textTransform: "none", px: 1, ml: -1, borderRadius: RADIUS.lg, minWidth: 0, maxWidth: "100%" }}
      aria-label="Switch recipe book"
      aria-expanded={open}
      aria-controls="kitchen-book-strip"
    >
      {current ? (
        <CategoryIconView icon={current.icon} sx={{ color: current.color, mr: 1, fontSize: 28 }} />
      ) : (
        <LibraryBooksIcon sx={{ mr: 1, fontSize: 28, opacity: 0.8 }} />
      )}
      <Typography variant="h5" component="span" sx={{ fontWeight: 800 }} noWrap>
        {current?.name ?? "All recipes"}
      </Typography>
    </Button>
  );
}

function Tile({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      sx={{
        flexShrink: 0,
        width: TILE,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.75,
        borderRadius: RADIUS.md,
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      {children}
      <Typography
        variant="caption"
        noWrap
        sx={{
          width: "100%",
          textAlign: "center",
          fontWeight: selected ? 700 : 400,
          color: selected ? "primary.main" : "text.primary",
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

interface StripProps {
  books: KitchenBook[];
  value: string;
  open: boolean;
  onChange: (id: string) => void;
  onClose: () => void;
}

/** A row of square book covers with the names under them. Hidden until the title is clicked; choosing a book closes it. */
export function BookStrip({ books, value, open, onChange, onClose }: StripProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const create = useCreateKitchenBook();
  const setCover = useSetKitchenBookCover();
  const { percent, onUploadProgress, reset } = useUploadProgress();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  // A cover chosen before the book exists: shown from the file on this device, sent once the book is made.
  const [cover, setCover_] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!cover) {
      setCoverUrl(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);
  const saving = create.isPending || setCover.isPending;

  const closeNew = () => {
    if (saving) return;
    setNewOpen(false);
    setName("");
    setCover_(null);
  };

  const pick = (id: string) => {
    onChange(id);
    onClose();
  };

  const createBook = async () => {
    const n = name.trim();
    if (!n || saving) return;
    let bookId: string;
    try {
      bookId = (await create.mutateAsync({ name: n })).book._id;
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message ?? "Couldn't create the book", { variant: "error" });
      return;
    }
    // The book exists now, so a cover that can't be saved must not undo it: say so and carry on.
    let coverSaved = true;
    if (cover) {
      try {
        await setCover.mutateAsync({ id: bookId, file: cover, onUploadProgress });
      } catch {
        coverSaved = false;
      } finally {
        reset();
      }
    }
    setNewOpen(false);
    setName("");
    setCover_(null);
    pick(bookId);
    if (coverSaved) enqueueSnackbar("Book created. Add people from Share", { variant: "success" });
    else {
      enqueueSnackbar("Book created, but the cover couldn't be saved. Add it in the book's settings.", {
        variant: "warning",
      });
    }
  };

  return (
    <>
      <Collapse in={open} unmountOnExit>
        <Box
          id="kitchen-book-strip"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          sx={{ display: "flex", gap: 2, overflowX: "auto", py: 1, px: 0.5, mb: 1.5, scrollbarWidth: "none" }}
        >
          <Tile label="All recipes" selected={value === "all"} onClick={() => pick("all")}>
            <Box
              sx={{
                width: TILE,
                height: TILE,
                border: 1,
                borderColor: "divider",
                borderRadius: RADIUS.md,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "text.secondary",
              }}
            >
              <LibraryBooksIcon />
            </Box>
          </Tile>
          {books.map((b) => (
            <Tile key={b._id} label={b.name} selected={value === b._id} onClick={() => pick(b._id)}>
              <BookCover book={b} size={TILE} />
            </Tile>
          ))}
          <Tile label="New book" onClick={() => setNewOpen(true)}>
            <Box
              sx={{
                width: TILE,
                height: TILE,
                border: 1,
                borderStyle: "dashed",
                borderColor: (t) => alpha(t.palette.text.secondary, 0.6),
                borderRadius: RADIUS.md,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "text.secondary",
              }}
            >
              <AddIcon />
            </Box>
          </Tile>
        </Box>
      </Collapse>

      <ResponsiveDialog
        open={newOpen}
        onClose={closeNew}
        title="New recipe book"
        maxWidth="xs"
        actions={
          <>
            <Button disabled={saving} onClick={closeNew}>
              Cancel
            </Button>
            <Button variant="contained" disabled={!name.trim() || saving} onClick={createBook}>
              Create
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Books are how you share: add people to a book and everything in it, including recipes added later, is shared
          with them.
        </Typography>
        <Stack spacing={2.5}>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            placeholder="e.g. Home"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createBook();
            }}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <CoverField
            preview={{ icon: "restaurant", color: theme.palette.primary.main, cover_url: coverUrl }}
            busy={saving}
            percent={percent}
            onPick={setCover_}
            onRemove={() => setCover_(null)}
          />
        </Stack>
      </ResponsiveDialog>
    </>
  );
}
