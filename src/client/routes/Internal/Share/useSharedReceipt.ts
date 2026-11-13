import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { clearShare, peekShare } from "../../../pwa/shareStash";
import { RECEIPT_PARAM, receiptImages } from "./receipt";

/**
 * When the page was opened from the share page with `?receipt=1`, hand the shared photos to `apply` once (and once only),
 * then forget them and drop the flag. `ready` is false until the page can take them (its group or book has loaded).
 */
export function useSharedReceipt(ready: boolean, maxImages: number, apply: (images: File[]) => void) {
  const [params, setParams] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const wanted = params.get(RECEIPT_PARAM) === "1";
  const taken = useRef(false);
  const latest = useRef(apply);
  latest.current = apply;

  useEffect(() => {
    if (!wanted || !ready || taken.current) return;
    taken.current = true;
    const next = new URLSearchParams(params);
    next.delete(RECEIPT_PARAM);
    setParams(next, { replace: true });
    void peekShare()
      .then(async (shared) => {
        const images = shared ? receiptImages(shared.files, maxImages) : [];
        if (images.length > 0) {
          latest.current(images);
          enqueueSnackbar(images.length === 1 ? "Receipt photo attached" : `${images.length} receipt photos attached`, {
            variant: "info",
          });
        }
        await clearShare();
      })
      .catch(() => undefined); // nothing was kept (it expired, or storage is unavailable): just the empty form
  }, [wanted, ready, maxImages, params, setParams, enqueueSnackbar]);
}
