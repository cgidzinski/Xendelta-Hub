import { useMemo, useState } from "react";
import {
  Container,
  Typography,
  TextField,
  InputAdornment,
  Box,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { useTitle } from "../../../hooks/useTitle";
import LinkIcon from "@mui/icons-material/Link";
import { useCreateXenLink, useDeleteXenLink, useUpdateXenLink, useXenLink, XenLink } from "../../../hooks/useXenlink";
import LinkList from "./components/LinkList";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";

export default function XenBox() {
  useTitle("XenLink");
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState("");
  const [EditLinkDialogOpen, setEditLinkDialogOpen] = useState(false);

  const emptyXenLink: XenLink = { _id: "", name: "", url: "", slug: "", createdAt: new Date(), updatedAt: new Date() };
  const [selectedLink, setSelectedLink] = useState<XenLink>(emptyXenLink);

  const { links, isLoading, isError, error } = useXenLink(search || undefined);
  const { mutateAsync: updateXenLink, isPending: isUpdating } = useUpdateXenLink();
  const { mutateAsync: createXenLink } = useCreateXenLink();
  const { mutateAsync: deleteXenLink } = useDeleteXenLink();

  const shareUrl = useMemo(() => {
    if (selectedLink?.slug) {
      return `${window.location.origin}/x/${selectedLink.slug}`;
    }
    return null;
  }, [selectedLink?.slug]);

  const handleCopyUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      enqueueSnackbar("URL copied to clipboard", { variant: "success" });
    }
  };

  const handleCreateLinkDialog = async () => {
    if (selectedLink) {
      if (selectedLink._id) {
        await updateXenLink(selectedLink);
        handleCloseEditLinkDialog();
      } else {
        await createXenLink(selectedLink);
        handleCloseEditLinkDialog();
      }
    }
  };

  const handleCloseEditLinkDialog = () => {
    setEditLinkDialogOpen(false);
    setSelectedLink(emptyXenLink);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          XenLink
        </Typography>
        <Button
          variant="contained"
          startIcon={<LinkIcon />}
          onClick={() => {
            setSelectedLink(emptyXenLink);
            setEditLinkDialogOpen(true);
          }}
        >
          New Link
        </Button>
      </Box>

      <Dialog open={EditLinkDialogOpen} onClose={handleCloseEditLinkDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Typography variant="h6">{selectedLink._id ? "Edit Link" : "Create Link"}</Typography>
              {selectedLink._id && (
                <IconButton onClick={handleCopyUrl} size="small">
                  <ContentCopyIcon />
                </IconButton>
              )}
            </Box>
            <IconButton onClick={handleCloseEditLinkDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, gap: 2, display: "flex", flexDirection: "column" }}>
            <TextField
              fullWidth
              label="Name"
              value={selectedLink?.name || ""}
              onChange={(e) => setSelectedLink((prev) => (prev ? { ...prev, name: e.target.value } : emptyXenLink))}
            />

            <TextField
              fullWidth
              label="URL"
              value={selectedLink?.url || ""}
              onChange={(e) => setSelectedLink((prev) => (prev ? { ...prev, url: e.target.value } : emptyXenLink))}
            />
            {selectedLink._id && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Slug: {selectedLink?.slug}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Created: {selectedLink?.createdAt ? format(selectedLink.createdAt, "MMM d, yyyy") : ""}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Updated: {selectedLink?.updatedAt ? format(selectedLink.updatedAt, "MMM d, yyyy") : ""}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Box sx={{ display: "flex", gap: 2, justifyContent: "space-between", width: "100%" }}>
            <Box>
              {selectedLink._id && (
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => {
                    deleteXenLink(selectedLink._id || "");
                    handleCloseEditLinkDialog();
                  }}
                >
                  <DeleteIcon />
                  Delete
                </Button>
              )}
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button onClick={handleCloseEditLinkDialog} disabled={isUpdating}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleCreateLinkDialog}
                disabled={!selectedLink.name || !selectedLink.url || isUpdating}
              >
                {selectedLink._id ? "Save" : "Create"}
              </Button>
            </Box>
          </Box>
        </DialogActions>
      </Dialog>

      <TextField
        fullWidth
        placeholder="Search links..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 4 }}
      />

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || "Failed to load links"}
        </Alert>
      )}

      <LinkList
        links={links}
        handleLinkClick={(id) => {
          setSelectedLink(links.find((link) => link._id === id) || emptyXenLink);
          setEditLinkDialogOpen(true);
        }}
        isLoading={isLoading}
        isError={isError}
        error={error}
      />
    </Container>
  );
}
