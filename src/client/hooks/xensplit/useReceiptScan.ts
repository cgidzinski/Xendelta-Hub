import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../config/api";
import { COST_CENTERS, billedRate, formatGems } from "@shared/billing";
import { xensplitKeys } from "./keys";

const scanCenter = COST_CENTERS.find((c) => c.id === "receipt_scans");
/** What one receipt scan costs, as people read it ("2.5 gems"). */
export const RECEIPT_SCAN_PRICE = formatGems(scanCenter ? billedRate(scanCenter) : 0);

/** A receipt as the server read it: what a person reviews before splitting it. Amounts are in dollars. */
export interface ScannedReceipt {
  merchant: string;
  /** YYYY-MM-DD, or "" when the photo had no readable date. */
  date: string;
  /** A 3-letter code, or "" when the receipt shows none. */
  currency: string;
  items: { name: string; amount: number }[];
  tax: number;
  tip: number;
  total: number;
}

/** Whether this server can read receipts from a photo (the button is left out when it can't). */
export function useReceiptScanEnabled() {
  const { data } = useQuery({
    queryKey: xensplitKeys.receiptScanStatus(),
    queryFn: async () => (await api.get<{ receipt_scan: boolean }>("/api/xensplit/scan-receipt/status")).receipt_scan,
    staleTime: Infinity,
    retry: false,
  });
  return !!data;
}

/** Read a receipt out of one photo. Nothing is saved: the dialog shows the lines for review. */
export const useScanReceipt = () =>
  useMutation({
    mutationFn: async (photo: File) => {
      const form = new FormData();
      form.append("image", photo);
      return (await api.post<{ receipt: ScannedReceipt }>("/api/xensplit/scan-receipt", form)).receipt;
    },
  });
