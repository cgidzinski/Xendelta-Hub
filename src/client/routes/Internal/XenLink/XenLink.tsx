import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import { useMemo, useState } from "react";
import {
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
import {
  useCreateXenLink,
  useDeleteXenLink,
  useUpdateXenLink,
  useXenLink,
  useXenLinkStats,
  XenLink,
  type XenLinkInput,
} from "../../../hooks/xenlink/useXenlink";
import { SLUG_PATTERN } from "@shared/xenlink";
import LinkList from "./components/LinkList";
import LinkQrCode from "./components/LinkQrCode";
import LinkStatsChart from "./components/LinkStatsChart";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";

export default function XenDrive() {
  useTitle("XenLink");
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState("");
  const [EditLinkDialogOpen, setEditLinkDialogOpen] = useState(false);

  const emptyXenLink: XenLink = { _id: "", name: "", url: "", slug: "", createdAt: new Date(), updatedAt: new Date() };
  const [selectedLink, setSelectedLink] = useState<XenLink>(emptyXenLink);

  const { links, isLoading, isError, error, refetch } = useXenLink(search || undefined);
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

  const original = selectedLink._id ? links.find((l) => l._id === selectedLink._id) : undefined;
  const { data: stats } = useXenLinkStats(EditLinkDialogOpen ? selectedLink._id || undefined : undefined);
  // A short name you chose has to be a readable one; empty means "pick one for me" (or "keep it").
  const slugProblem =
    !!selectedLink.slug && selectedLink.slug !== original?.slug && !SLUG_PATTERN.test(selectedLink.slug);

  const handleCreateLinkDialog = async () => {
    if (!selectedLink) return;
    const input: XenLinkInput = {
      name: selectedLink.name,
      url: selectedLink.url,
      // The slug is only sent when it is one the person chose: typed on a new link, or changed on an existing one.
      ...(selectedLink.slug && selectedLink.slug !== original?.slug ? { slug: selectedLink.slug } : {}),
      // New links without an expiry send nothing; an edit sends the current value, null meaning "never".
      ...(selectedLink._id || selectedLink.expires_at ? { expiresAt: selectedLink.expires_at ?? null } : {}),
    };
    try {
      if (selectedLink._id) await updateXenLink({ ...input, _id: selectedLink._id });
      else await createXenLink(input);
      handleCloseEditLinkDialog();
    } catch {
      // The dialog stays open and the failure (a short name that's taken, an address that isn't one) is already shown.
    }
  };

  const handleCloseEditLinkDialog = () => {
    setEditLinkDialogOpen(false);
    setSelectedLink(emptyXenLink);
  };

  return (
    <PageContainer>
      <PageHeader
        title="XenLink"
        actions={
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
        }
      />

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
            <TextField
              fullWidth
              label="Short name"
              placeholder="Leave empty for a random one"
              value={selectedLink.slug || ""}
              onChange={(e) => setSelectedLink((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
              error={slugProblem}
              helperText={
                slugProblem
                  ? "Use 3 to 40 letters, numbers, - or _"
                  : `${window.location.origin}/x/${selectedLink.slug || "…"}${selectedLink._id ? "  (changing it stops the old link working)" : ""}`
              }
              slotProps={{
                htmlInput: { maxLength: 40, autoCapitalize: "none", autoCorrect: "off", spellCheck: false },
              }}
            />
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <TextField
                fullWidth
                type="datetime-local"
                label="Stops working on"
                value={selectedLink.expires_at ? format(new Date(selectedLink.expires_at), "yyyy-MM-dd'T'HH:mm") : ""}
                onChange={(e) => {
                  const when = e.target.value ? new Date(e.target.value) : null;
                  setSelectedLink((prev) => ({
                    ...prev,
                    expires_at: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
                  }));
                }}
                helperText={selectedLink.expires_at ? undefined : "Never, unless you pick a time"}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              {selectedLink.expires_at && (
                <Button
                  size="small"
                  sx={{ mt: 1.25, whiteSpace: "nowrap" }}
                  onClick={() => setSelectedLink((prev) => ({ ...prev, expires_at: null }))}
                >
                  Never expire
                </Button>
              )}
            </Box>
            {selectedLink._id && stats && <LinkStatsChart stats={stats} />}
            {selectedLink._id && shareUrl && <LinkQrCode url={shareUrl} name={selectedLink.name} />}
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
                disabled={!selectedLink.name || !selectedLink.url || isUpdating || slugProblem}
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
        onRetry={() => refetch()}
      />
    </PageContainer>
  );
}
