import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { formatMoney } from "@shared/money";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import {
  RECEIPT_SCAN_PRICE as SCAN_PRICE,
  useScanReceipt,
  type ScannedReceipt,
} from "../../../../hooks/xensplit/useReceiptScan";
import { sanitizeAmount } from "../../../../utils/currencyUtils";
import { splitReceipt } from "../receiptSplit";

type Member = { user_id: string; username: string };

/** What the form is filled with once the lines are assigned. */
export interface ReceiptResult {
  title: string;
  amount: number;
  /** "" when the receipt shows no date. */
  date: string;
  currency: string;
  /** What each person owes, by user id. */
  owed: Record<string, number>;
}

interface ReceiptScanDialogProps {
  open: boolean;
  /** The photo to read. */
  photo: File | null;
  members: Member[];
  /** The currency the form has now, used when the receipt shows none or one the group doesn't use. */
  currency: string;
  currencyOptions: string[];
  onClose: () => void;
  onApply: (result: ReceiptResult) => void;
}

/**
 * Read a receipt photo into lines, then say who had what. Nothing is charged until the person presses Read receipt;
 * a scan costs gems (the monthly free allowance covers it first). Each line starts shared by everyone.
 */
export default function ReceiptScanDialog({
  open,
  photo,
  members,
  currency,
  currencyOptions,
  onClose,
  onApply,
}: ReceiptScanDialogProps) {
  const scan = useScanReceipt();
  const { reset } = scan;
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);
  const [assignments, setAssignments] = useState<string[][]>([]);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");

  // A fresh start each time the dialog opens.
  useEffect(() => {
    if (open) {
      setReceipt(null);
      reset();
    }
  }, [open, reset]);

  const everyone = useMemo(() => members.map((m) => m.user_id), [members]);

  const runScan = async () => {
    if (!photo) return;
    try {
      const result = await scan.mutateAsync(photo);
      setReceipt(result);
      setAssignments(result.items.map(() => everyone));
      setTax(result.tax ? String(result.tax) : "");
      setTip(result.tip ? String(result.tip) : "");
    } catch {
      // The failure is shown from scan.error below.
    }
  };

  const taxN = parseFloat(tax) || 0;
  const tipN = parseFloat(tip) || 0;
  const owed = useMemo(
    () => (receipt ? splitReceipt(receipt.items, assignments, taxN, tipN) : {}),
    [receipt, assignments, taxN, tipN],
  );
  const total = Object.values(owed).reduce((a, b) => a + b, 0);
  const unassigned = receipt ? assignments.filter((a) => a.length === 0).length : 0;
  const money = (n: number) => formatMoney(n, receipt?.currency || currency);

  const toggle = (line: number, id: string) =>
    setAssignments((prev) =>
      prev.map((people, i) =>
        i !== line ? people : people.includes(id) ? people.filter((p) => p !== id) : [...people, id],
      ),
    );

  const apply = () => {
    if (!receipt) return;
    const code = receipt.currency && currencyOptions.includes(receipt.currency) ? receipt.currency : currency;
    onApply({ title: receipt.merchant, amount: total, date: receipt.date, currency: code, owed });
  };

  const errorMessage =
    scan.error instanceof Error ? scan.error.message : scan.error ? "Couldn't read that receipt" : "";

  const amountField = (label: string, value: string, set: (v: string) => void) => (
    <TextField
      label={label}
      size="small"
      value={value}
      onChange={(e) => {
        const v = sanitizeAmount(e.target.value);
        if (v !== null) set(v);
      }}
      slotProps={{ htmlInput: { inputMode: "decimal" } }}
    />
  );

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Read receipt"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {receipt && (
            <Button variant="contained" onClick={apply} disabled={Object.keys(owed).length === 0}>
              Use these lines
            </Button>
          )}
        </>
      }
    >
      {!receipt ? (
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Turn the photo into line items, then pick who had what. Tax and tip are shared in proportion.
          </Typography>
          <Alert severity="info" variant="outlined">
            A scan costs {SCAN_PRICE}, and your monthly free allowance covers it first. It is charged even if nothing is
            found, so an upright, sharp photo of the whole receipt works best.
          </Alert>
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          <Button variant="contained" onClick={runScan} disabled={!photo || scan.isPending}>
            {scan.isPending ? <CircularProgress size={20} /> : `Read receipt for ${SCAN_PRICE}`}
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {receipt.merchant || "Receipt"} · check the lines, then tap the names that shared each one.
          </Typography>
          {receipt.items.map((line, i) => (
            <Box key={i} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "action.hover" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 1 }}>
                <Typography variant="body2">{line.name}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {money(line.amount)}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {members.map((m) => {
                  const on = assignments[i]?.includes(m.user_id);
                  return (
                    <Chip
                      key={m.user_id}
                      size="small"
                      label={m.username}
                      color={on ? "primary" : "default"}
                      variant={on ? "filled" : "outlined"}
                      onClick={() => toggle(i, m.user_id)}
                    />
                  );
                })}
              </Box>
            </Box>
          ))}
          <Box sx={{ display: "flex", gap: 2 }}>
            {amountField("Tax", tax, setTax)}
            {amountField("Tip", tip, setTip)}
          </Box>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
            {members
              .filter((m) => owed[m.user_id] !== undefined)
              .map((m) => (
                <Box key={m.user_id} sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2">{m.username}</Typography>
                  <Typography variant="body2">{money(owed[m.user_id])}</Typography>
                </Box>
              ))}
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
              <Typography variant="subtitle2">Total</Typography>
              <Typography variant="subtitle2">{money(total)}</Typography>
            </Box>
          </Box>
          {unassigned > 0 && (
            <Alert severity="warning" variant="outlined">
              {unassigned === 1 ? "1 line has" : `${unassigned} lines have`} nobody picked, so{" "}
              {unassigned === 1 ? "it isn't" : "they aren't"} in the total.
            </Alert>
          )}
        </Stack>
      )}
    </ResponsiveDialog>
  );
}
