import { useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Stack, Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import type { XenBudgetImportBatch } from "../../../../hooks/xenbudget/types";
import { useXenBudgetImports, useXenBudgetImport } from "../../../../hooks/xenbudget/useImport";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import { cardSx } from "../../../../components/ui/surfaceStyles";

interface ImportHistoryProps {
    bookId: string;
}

/**
 * Every CSV import, with which card it came from and when.
 *
 * This lives in Settings rather than only in the wizard because the case it exists for is
 * realising weeks later that a file was wrong — by which time the wizard that could have
 * undone it is long closed.
 */
export default function ImportHistory({ bookId }: ImportHistoryProps) {
    const { enqueueSnackbar } = useSnackbar();
    const { imports, isLoading } = useXenBudgetImports(bookId);
    const { undoImportAsync, isUndoing } = useXenBudgetImport(bookId);
    const [confirming, setConfirming] = useState<XenBudgetImportBatch | null>(null);

    const remove = async () => {
        if (!confirming) return;
        try {
            const result = await undoImportAsync(confirming._id);
            enqueueSnackbar(`Removed ${result.deleted} item${result.deleted === 1 ? "" : "s"}`, { variant: "success" });
            setConfirming(null);
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Could not remove that import", { variant: "error" });
        }
    };

    if (isLoading) return <LoadingSpinner message="Loading imports..." />;
    if (imports.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                Nothing imported yet. Imports show up here so you can remove one later.
            </Typography>
        );
    }

    return (
        <Box>
            <Stack spacing={0.75}>
                {imports.map((batch) => (
                    <Stack
                        key={batch._id} direction="row" alignItems="center" spacing={1}
                        sx={{ ...cardSx, px: 1.25, py: 1 }}
                    >
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap>{batch.source_label}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                {new Date(batch.imported_at).toLocaleString()} · {batch.imported_by_name} ·{" "}
                                {batch.remaining} of {batch.row_count} still here
                            </Typography>
                        </Box>
                        <Button
                            size="small" color="error"
                            disabled={batch.remaining === 0}
                            onClick={() => setConfirming(batch)}
                        >
                            {batch.remaining === 0 ? "Gone" : "Delete"}
                        </Button>
                    </Stack>
                ))}
            </Stack>

            <Dialog open={!!confirming} onClose={() => setConfirming(null)}>
                <DialogTitle>Delete this import?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This permanently removes the {confirming?.remaining} item
                        {confirming?.remaining === 1 ? "" : "s"} still in the book from
                        &ldquo;{confirming?.source_label}&rdquo;
                        {confirming?.imported_at
                            ? `, imported ${new Date(confirming.imported_at).toLocaleDateString()}`
                            : ""}. Nothing else is touched.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirming(null)}>Cancel</Button>
                    <Button color="error" disabled={isUndoing} onClick={remove}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
