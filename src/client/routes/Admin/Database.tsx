import { useRef, useState } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import UploadIcon from "@mui/icons-material/Upload";
import { useSnackbar } from "notistack";
import { useTitle } from "../../hooks/useTitle";
import { useAdminDatabase } from "../../hooks/admin/useAdminDatabase";

const CONFIRMATION_PHRASE = "RESTORE DATABASE";

export default function Database() {
  const { enqueueSnackbar } = useSnackbar();
  const {
    collections,
    collectionsGeneratedAt,
    isLoadingCollections,
    exportDatabase,
    isExporting,
    importDatabase,
    isImporting,
  } = useAdminDatabase();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [skipSafetySnapshot, setSkipSafetySnapshot] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  useTitle("Database");

  const totalDocuments = collections.reduce((sum, c) => sum + c.count, 0);
  const canRestore = !!selectedFile && confirmationInput === CONFIRMATION_PHRASE;

  const handleExport = () => {
    exportDatabase()
      .then(() => {
        enqueueSnackbar("Database backup downloaded", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(error.message || "Failed to export database", { variant: "error" });
      });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleRestore = () => {
    if (!selectedFile) return;

    importDatabase(selectedFile, confirmationInput, skipSafetySnapshot)
      .then((data) => {
        setConfirmDialogOpen(false);
        setSelectedFile(null);
        setConfirmationInput("");
        if (fileInputRef.current) fileInputRef.current.value = "";

        const inserted = data.collections.reduce((sum, c) => sum + c.inserted, 0);
        enqueueSnackbar(
          `Database restored: ${inserted} documents across ${data.collections.length} collections. Reload the app to see fresh data.`,
          { variant: "success", autoHideDuration: 8000 }
        );
      })
      .catch((error) => {
        setConfirmDialogOpen(false);
        enqueueSnackbar(error.message || "Failed to restore database", { variant: "error" });
      });
  };

  return (
    <Box>
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Database
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Export or restore the entire MongoDB database
          </Typography>
        </Box>

        {/* Export Card */}
        <Card elevation={3} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Export Database
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Downloads a compressed backup of every collection's documents. This captures MongoDB
            data only — uploaded file bytes (avatars, blog images, XenBox files) live in Google
            Cloud Storage and are not included.
          </Typography>

          <TableContainer sx={{ mb: 2, maxHeight: 320 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Collection</TableCell>
                  <TableCell align="right">Documents</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {collections.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell align="right">{c.count.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!isLoadingCollections && collections.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Typography variant="body2" color="text.secondary">
                        No collections found
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {collectionsGeneratedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              {totalDocuments.toLocaleString()} total documents across {collections.length} collections
            </Typography>
          )}

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={isExporting}
            size="large"
          >
            {isExporting ? "Preparing download..." : "Download Backup"}
          </Button>
        </Card>

        {/* Danger Zone Card */}
        <Card elevation={3} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h5" gutterBottom color="error">
            Danger Zone
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Restoring a backup <strong>wipes every collection in the database</strong> and replaces
            it with the contents of the uploaded file. This action cannot be undone. A safety
            snapshot of the current database is taken automatically before the wipe, unless
            disabled below.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 480 }}>
            <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
              {selectedFile ? selectedFile.name : "Choose backup file (.gz)"}
              <input ref={fileInputRef} type="file" accept=".gz" hidden onChange={handleFileSelect} />
            </Button>

            {selectedFile && <Chip label={selectedFile.name} onDelete={() => setSelectedFile(null)} sx={{ alignSelf: "flex-start" }} />}

            <TextField
              label={`Type "${CONFIRMATION_PHRASE}" to confirm`}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              fullWidth
              size="small"
              error={confirmationInput.length > 0 && confirmationInput !== CONFIRMATION_PHRASE}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={skipSafetySnapshot}
                  onChange={(e) => setSkipSafetySnapshot(e.target.checked)}
                />
              }
              label="Skip automatic safety snapshot (not recommended)"
            />

            <Button
              variant="contained"
              color="error"
              startIcon={<UploadIcon />}
              onClick={() => setConfirmDialogOpen(true)}
              disabled={!canRestore || isImporting}
              size="large"
            >
              {isImporting ? "Restoring..." : "Restore Database"}
            </Button>
          </Box>
        </Card>

        {/* Final confirmation dialog */}
        <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
          <DialogTitle>Restore Database?</DialogTitle>
          <DialogContent>
            <Typography>
              This will permanently delete all current data in every collection and replace it
              with the contents of <strong>{selectedFile?.name}</strong>. This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialogOpen(false)} disabled={isImporting}>
              Cancel
            </Button>
            <Button onClick={handleRestore} color="error" variant="contained" disabled={isImporting}>
              {isImporting ? "Restoring..." : "Yes, wipe and restore"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
