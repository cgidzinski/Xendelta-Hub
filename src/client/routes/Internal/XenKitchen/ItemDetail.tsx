import { useState } from "react";
import { Box, Button, Container, IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import PrintIcon from "@mui/icons-material/Print";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import {
  useDeleteKitchenItem, useDuplicateKitchenItem, useKitchenItem, useUpdateKitchenItem,
} from "../../../hooks/xenkitchen/useKitchen";
import ItemView from "./components/ItemView";
import ItemEditor from "./components/ItemEditor";
import ShareDialog from "./components/ShareDialog";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { item, isLoading, isError, error, refetch } = useKitchenItem(id);
  const update = useUpdateKitchenItem();
  const remove = useDeleteKitchenItem();
  const duplicate = useDuplicateKitchenItem();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  useTitle(item?.title || "XenKitchen");

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/internal/xenkitchen"));

  const del = async () => {
    setMenu(null);
    if (!item) return;
    if (!(await confirm({ title: `Delete "${item.title || "Untitled"}"?`, message: "Its photos are deleted too. This can't be undone." }))) return;
    await remove.mutateAsync(item._id);
    enqueueSnackbar("Deleted", { variant: "success" });
    navigate("/internal/xenkitchen", { replace: true });
  };

  const dup = async () => {
    setMenu(null);
    if (!item) return;
    const { item: copy } = await duplicate.mutateAsync(item._id);
    enqueueSnackbar("Duplicated", { variant: "success" });
    navigate(`/internal/xenkitchen/${copy._id}`);
  };

  return (
    <Container maxWidth="md" sx={{ mt: 2, mb: 8 }}>
      <Box sx={{ mb: 1, "@media print": { display: "none" } }}>
        <Button startIcon={<ArrowBackIcon />} color="inherit" onClick={back}>Kitchen</Button>
      </Box>

      {isLoading && <LoadingSpinner message="Loading…" />}
      {!isLoading && (isError || !item) && <ErrorDisplay error={error} title="Couldn't load this" onRetry={() => refetch()} />}

      {item && (
        <>
          <ItemView
            item={item}
            actions={
              <Box sx={{ display: "flex", gap: 0.5, "@media print": { display: "none" } }}>
                <Tooltip title={item.favorite ? "Unfavorite" : "Favorite"}>
                  <IconButton onClick={() => update.mutate({ id: item._id, patch: { favorite: !item.favorite } })} sx={{ color: item.favorite ? "#f9a825" : undefined }}>
                    {item.favorite ? <StarIcon /> : <StarBorderIcon />}
                  </IconButton>
                </Tooltip>
                <Button variant="outlined" startIcon={<ShareIcon />} onClick={() => setSharing(true)}>
                  {item.share?.enabled ? "Shared" : "Share"}
                </Button>
                <Button variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(true)}>Edit</Button>
                <IconButton aria-label="More" onClick={(e) => setMenu(e.currentTarget)}><MoreVertIcon /></IconButton>
              </Box>
            }
          />
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            <MenuItem onClick={dup}><ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>Duplicate</MenuItem>
            <MenuItem onClick={() => { setMenu(null); setTimeout(() => window.print(), 100); }}><ListItemIcon><PrintIcon fontSize="small" /></ListItemIcon>Print</MenuItem>
            <MenuItem onClick={del} sx={{ color: "error.main" }}><ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>Delete</MenuItem>
          </Menu>
          <ItemEditor open={editing} onClose={() => setEditing(false)} item={item} />
          <ShareDialog open={sharing} onClose={() => setSharing(false)} item={item} />
        </>
      )}
    </Container>
  );
}
