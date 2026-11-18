import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { formatMoney } from "@shared/money";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { RECEIPT_SCAN_PRICE, useScanReceipt, type ScannedReceipt } from "../../../../hooks/xensplit/useReceiptScan";

interface ReceiptFillDialogProps {
  open: boolean;
  /** The photo to read. */
  photo: File | null;
  /** The book's currency, used to show the amounts and kept when the receipt shows a different one. */
  currency: string;
  onClose: () => void;
  onApply: (receipt: ScannedReceipt) => void;
}

/**
 * Read a receipt photo to fill an item's description (the shop), amount (the total) and date. Nothing is charged
 * until the person presses the button; a scan costs gems, covered first by the monthly free allowance.
 */
export default function ReceiptFillDialog({ open, photo, currency, onClose, onApply }: ReceiptFillDialogProps) {
  const scan = useScanReceipt();
  const { reset } = scan;
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);

  // A fresh start each time the dialog opens.
  useEffect(() => {
    if (open) {
      setReceipt(null);
      reset();
    }
  }, [open, reset]);

  const runScan = async () => {
    if (!photo) return;
    try {
      setReceipt(await scan.mutateAsync(photo));
    } catch {
      // The failure is shown from scan.error below.
    }
  };

  const errorMessage =
    scan.error instanceof Error ? scan.error.message : scan.error ? "Couldn't read that receipt" : "";
  const shown = receipt?.currency && receipt.currency !== currency ? receipt.currency : currency;

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Read receipt"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {receipt && (
            <Button variant="contained" onClick={() => onApply(receipt)}>
              Fill the form
            </Button>
          )}
        </>
      }
    >
      {!receipt ? (
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Fill in the description, amount and date from the photo. You can change anything afterwards.
          </Typography>
          <Alert severity="info" variant="outlined">
            A scan costs {RECEIPT_SCAN_PRICE}, and your monthly free allowance covers it first. It is charged even if
            nothing is found, so an upright, sharp photo of the whole receipt works best.
          </Alert>
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          <Button variant="contained" onClick={runScan} disabled={!photo || scan.isPending}>
            {scan.isPending ? <CircularProgress size={20} /> : `Read receipt for ${RECEIPT_SCAN_PRICE}`}
          </Button>
        </Stack>
      ) : (
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "action.hover" }}>
            <Typography variant="subtitle2">{receipt.merchant || "Receipt"}</Typography>
            <Typography variant="body2" color="text.secondary">
              {receipt.items.length} {receipt.items.length === 1 ? "line" : "lines"}
              {receipt.date ? ` · ${receipt.date}` : ""}
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.5 }}>
              {formatMoney(receipt.total, shown)}
            </Typography>
          </Box>
          {receipt.currency && receipt.currency !== currency && (
            <Alert severity="warning" variant="outlined">
              The receipt is in {receipt.currency}, but this book uses {currency}. The amount is copied as it is
              printed, so convert it if you need to.
            </Alert>
          )}
        </Stack>
      )}
    </ResponsiveDialog>
  );
}
