import PageContainer from "../../../components/ui/PageContainer";
import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import PrintIcon from "@mui/icons-material/Print";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import LibraryAddIcon from "@mui/icons-material/LibraryAdd";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import {
  canEditBook,
  useCopyKitchenItem,
  useDeleteKitchenItem,
  useDuplicateKitchenItem,
  useKitchenBooks,
  useKitchenItem,
  useMoveKitchenItem,
  useToggleKitchenFavorite,
} from "../../../hooks/xenkitchen/useKitchen";
import ItemView from "./components/ItemView";
import ItemEditor from "./components/ItemEditor";
import ShareDialog from "./components/ShareDialog";
import { CategoryIconView } from "./components/kitchenIcons";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { item, isLoading, isError, error, refetch } = useKitchenItem(id);
  const { books } = useKitchenBooks();
  const favorite = useToggleKitchenFavorite();
  const remove = useDeleteKitchenItem();
  const duplicate = useDuplicateKitchenItem();
  const move = useMoveKitchenItem();
  const copy = useCopyKitchenItem();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [bookPicker, setBookPicker] = useState<null | "move" | "copy">(null);
  useTitle(item?.title || "XenKitchen");

  const editable = canEditBook(item?.my_role);
  const targets = books.filter((b) => canEditBook(b.my_role) && b._id !== item?.book_id);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/internal/xenkitchen"));
  const err = (e: any) => enqueueSnackbar(e?.response?.data?.message ?? "Something went wrong", { variant: "error" });

  const del = async () => {
    setMenu(null);
    if (!item) return;
    const shared = books.find((b) => b._id === item.book_id)?.members.length ?? 1;
    if (
      !(await confirm({
        title: `Delete "${item.title || "Untitled"}"?`,
        message: `Its photos are deleted too${shared > 1 ? `, and it's removed for everyone in ${item.book?.name}` : ""}. This can't be undone.`,
      }))
    )
      return;
    try {
      await remove.mutateAsync(item._id);
    } catch (e) {
      err(e);
      return;
    }
    enqueueSnackbar("Deleted", { variant: "success" });
    navigate("/internal/xenkitchen", { replace: true });
  };

  const dup = async () => {
    setMenu(null);
    if (!item) return;
    const { item: c } = await duplicate.mutateAsync(item._id);
    enqueueSnackbar("Duplicated", { variant: "success" });
    navigate(`/internal/xenkitchen/${c._id}`);
  };

  const toBook = async (bookId: string) => {
    if (!item || !bookPicker) return;
    const action = bookPicker;
    setBookPicker(null);
    const name = books.find((b) => b._id === bookId)?.name;
    try {
      if (action === "move") {
        await move.mutateAsync({ id: item._id, book_id: bookId });
        enqueueSnackbar(`Moved to ${name}`, { variant: "success" });
      } else {
        const { item: c } = await copy.mutateAsync({ id: item._id, book_id: bookId });
        enqueueSnackbar(`Copied to ${name}`, { variant: "success" });
        navigate(`/internal/xenkitchen/${c._id}`);
      }
    } catch (e) {
      err(e);
    }
  };

  const by = item?.created_by;
  const changedBy = item?.updated_by && item.updated_by !== item.created_by ? item.updated_by : null;

  return (
    <PageContainer width="narrow">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, "@media print": { display: "none" } }}>
        <Button startIcon={<ArrowBackIcon />} color="inherit" onClick={back}>
          Kitchen
        </Button>
        {item?.book && (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
            <MenuBookIcon sx={{ fontSize: 16, verticalAlign: "-3px", mr: 0.5 }} />
            <Box
              component="span"
              role="link"
              sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
              onClick={() => navigate(`/internal/xenkitchen?book=${item.book!._id}`)}
            >
              {item.book.name}
            </Box>
            {by ? ` · added by ${by}` : ""}
            {changedBy ? ` · edited by ${changedBy}` : ""}
            {!editable && " · view only"}
          </Typography>
        )}
      </Stack>

      {isLoading && <LoadingSpinner message="Loading…" />}
      {!isLoading && (isError || !item) && (
        <ErrorDisplay error={error} title="Couldn't load this" onRetry={() => refetch()} />
      )}

      {item && (
        <>
          <ItemView
            item={item}
            actions={
              <Box sx={{ display: "flex", gap: 0.5, "@media print": { display: "none" } }}>
                <Tooltip title={item.favorite ? "Unfavorite" : "Favorite (just for you)"}>
                  <IconButton
                    onClick={() => favorite.mutate({ id: item._id, on: !item.favorite })}
                    sx={{ color: item.favorite ? "warning.main" : undefined }}
                  >
                    {item.favorite ? <StarIcon /> : <StarBorderIcon />}
                  </IconButton>
                </Tooltip>
                {editable && (
                  <>
                    <Button variant="outlined" startIcon={<ShareIcon />} onClick={() => setSharing(true)}>
                      {item.share?.enabled ? "Shared" : "Share"}
                    </Button>
                    <Button variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  </>
                )}
                <IconButton aria-label="More" onClick={(e) => setMenu(e.currentTarget)}>
                  <MoreVertIcon />
                </IconButton>
              </Box>
            }
          />
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            {editable && (
              <MenuItem onClick={dup}>
                <ListItemIcon>
                  <ContentCopyIcon fontSize="small" />
                </ListItemIcon>
                Duplicate
              </MenuItem>
            )}
            {editable && (
              <MenuItem
                disabled={!targets.length}
                onClick={() => {
                  setMenu(null);
                  setBookPicker("move");
                }}
              >
                <ListItemIcon>
                  <DriveFileMoveIcon fontSize="small" />
                </ListItemIcon>
                Move to book…
              </MenuItem>
            )}
            <MenuItem
              disabled={!targets.length}
              onClick={() => {
                setMenu(null);
                setBookPicker("copy");
              }}
            >
              <ListItemIcon>
                <LibraryAddIcon fontSize="small" />
              </ListItemIcon>
              Copy to book…
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                setTimeout(() => window.print(), 100);
              }}
            >
              <ListItemIcon>
                <PrintIcon fontSize="small" />
              </ListItemIcon>
              Print
            </MenuItem>
            {editable && (
              <MenuItem onClick={del} sx={{ color: "error.main" }}>
                <ListItemIcon>
                  <DeleteOutlineIcon fontSize="small" color="error" />
                </ListItemIcon>
                Delete
              </MenuItem>
            )}
          </Menu>

          <Dialog open={!!bookPicker} onClose={() => setBookPicker(null)} fullWidth maxWidth="xs">
            <DialogTitle sx={{ fontWeight: 700 }}>
              {bookPicker === "move" ? "Move to which book?" : "Copy to which book?"}
            </DialogTitle>
            <DialogContent sx={{ px: 1 }}>
              {bookPicker === "move" && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, mb: 1 }}>
                  It leaves {item.book?.name}, so people there who aren't in the new book lose access.
                </Typography>
              )}
              {targets.map((b) => (
                <MenuItem key={b._id} onClick={() => toBook(b._id)}>
                  <ListItemIcon>
                    <CategoryIconView icon={b.icon} sx={{ color: b.color }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={b.name}
                    secondary={b.members.length > 1 ? `${b.members.length} people` : "Only you"}
                  />
                </MenuItem>
              ))}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setBookPicker(null)}>Cancel</Button>
            </DialogActions>
          </Dialog>

          {editable && <ItemEditor open={editing} onClose={() => setEditing(false)} item={item} />}
          {editable && <ShareDialog open={sharing} onClose={() => setSharing(false)} item={item} />}
        </>
      )}
    </PageContainer>
  );
}
