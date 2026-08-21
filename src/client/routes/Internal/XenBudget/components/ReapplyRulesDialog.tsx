import { useEffect, useState } from "react";
import {
    Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, Stack, Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import type { ReapplyResult } from "../../../../hooks/xenbudget/types";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import { cardSx } from "../../../../components/ui/surfaceStyles";

interface ReapplyRulesDialogProps {
    open: boolean;
    onClose: () => void;
    reapply: (opts: { dry_run?: boolean; include_manually_edited?: boolean }) => Promise<ReapplyResult>;
    isReapplying: boolean;
}

/**
 * A sweep rewrites tags, flags and exclusions across every item in the book, so it always
 * runs as a dry run first and shows what would change before anything is written.
 */
export default function ReapplyRulesDialog({ open, onClose, reapply, isReapplying }: ReapplyRulesDialogProps) {
    const { enqueueSnackbar } = useSnackbar();
    const [includeManual, setIncludeManual] = useState(false);
    const [preview, setPreview] = useState<ReapplyResult | null>(null);
    const [done, setDone] = useState<ReapplyResult | null>(null);

    // Re-run the preview whenever the dialog opens or the manual-items toggle changes,
    // so what's on screen always describes the sweep that the button would run.
    useEffect(() => {
        if (!open) {
            setPreview(null);
            setDone(null);
            return;
        }
        let cancelled = false;
        reapply({ dry_run: true, include_manually_edited: includeManual })
            .then((r) => { if (!cancelled) setPreview(r); })
            .catch((e) => enqueueSnackbar(e instanceof Error ? e.message : "Failed to preview", { variant: "error" }));
        return () => { cancelled = true; };
    }, [open, includeManual, reapply, enqueueSnackbar]);

    const handleApply = async () => {
        try {
            setDone(await reapply({ dry_run: false, include_manually_edited: includeManual }));
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to re-apply rules", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Re-apply rules</DialogTitle>
            <DialogContent>
                {done ? (
                    <Alert severity="success">
                        Updated {done.changed} item{done.changed === 1 ? "" : "s"}.
                    </Alert>
                ) : !preview ? (
                    <LoadingSpinner message="Working out what would change..." />
                ) : (
                    <Stack spacing={2}>
                        <Typography variant="body2" color="text.secondary">
                            Every item is stripped of what rules previously did to it, then re-evaluated
                            against the current rules. That is what makes deleting a rule actually undo
                            its effects. Amounts, dates and notes are never touched.
                        </Typography>

                        <Alert severity={preview.changed > 0 ? "info" : "success"}>
                            {preview.changed === 0
                                ? `Nothing would change across ${preview.examined} items.`
                                : `${preview.changed} of ${preview.examined} items would change.`}
                        </Alert>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small" checked={includeManual}
                                    onChange={(e) => setIncludeManual(e.target.checked)}
                                />
                            }
                            label={`Also sweep items I've edited by hand${
                                preview.skipped_manually_edited ? ` (${preview.skipped_manually_edited} skipped)` : ""
                            }`}
                        />
                        {includeManual && (
                            <Alert severity="warning">
                                Hand-made corrections to those items will be overwritten by the rules.
                            </Alert>
                        )}

                        {preview.sample.length > 0 && (
                            <Box sx={{ ...cardSx, p: 1.25, maxHeight: 260, overflowY: "auto" }}>
                                <Stack spacing={1}>
                                    {preview.sample.map((change) => (
                                        <Box key={change._id}>
                                            <Typography variant="body2" noWrap>{change.description}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {describe(change)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>
                                {preview.changed > preview.sample.length && (
                                    <Typography variant="caption" color="text.secondary">
                                        …and {preview.changed - preview.sample.length} more
                                    </Typography>
                                )}
                            </Box>
                        )}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{done ? "Close" : "Cancel"}</Button>
                {!done && (
                    <Button
                        variant="contained"
                        disabled={isReapplying || !preview || preview.changed === 0}
                        onClick={handleApply}
                    >
                        Apply to {preview?.changed ?? 0} item{preview?.changed === 1 ? "" : "s"}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

function describe(change: ReapplyResult["sample"][number]): string {
    const parts: string[] = [];
    const added = change.after.tags.filter((t) => !change.before.tags.includes(t));
    const removed = change.before.tags.filter((t) => !change.after.tags.includes(t));
    if (added.length) parts.push(`+${added.join(", ")}`);
    if (removed.length) parts.push(`−${removed.join(", ")}`);
    if (change.before.excluded !== change.after.excluded) {
        parts.push(change.after.excluded ? "excluded from totals" : "back in totals");
    }
    if (change.before.flagged !== change.after.flagged) {
        parts.push(change.after.flagged ? "flagged" : "unflagged");
    }
    if (change.before.type !== change.after.type) parts.push(`now ${change.after.type}`);
    if (change.before.description !== change.after.description) {
        parts.push(`renamed from "${change.before.description}"`);
    }
    return parts.join(" · ");
}
