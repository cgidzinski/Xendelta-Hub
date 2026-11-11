import { useCallback, useState } from "react";
import type { AxiosProgressEvent } from "axios";

/**
 * Upload progress for any request that sends a body.
 *
 *   const { percent, onUploadProgress, reset } = useUploadProgress();
 *   await apiClient.post(url, formData, { onUploadProgress });
 *   ...
 *   <UploadProgress percent={percent} />
 *
 * `percent` is null when nothing is uploading. It reaches 100 when the bytes have been sent, which
 * is before the server has finished with them; UploadProgress shows "Processing..." from there.
 */
export function useUploadProgress() {
  const [percent, setPercent] = useState<number | null>(null);

  const onUploadProgress = useCallback((event: AxiosProgressEvent) => {
    if (!event.total) return;
    setPercent(Math.min(100, Math.round((event.loaded / event.total) * 100)));
  }, []);

  const reset = useCallback(() => setPercent(null), []);

  return { percent, onUploadProgress, reset };
}
