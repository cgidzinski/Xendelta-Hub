import { useEffect, useEffectEvent } from "react";
import { useSnackbar } from "notistack";
import { useLocation, useNavigate } from "react-router-dom";

/** Open a record from the URL once, then remove its parameter so refresh keeps the dialog closed. */
export function useRecordLink<T>(
  parameter: string,
  load: (id: string, signal: AbortSignal) => Promise<T | undefined>,
  open: (record: T) => void,
  unavailableMessage: string,
) {
  const { pathname, search, hash, state, key } = useLocation();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const loadRecord = useEffectEvent(load);
  const openRecord = useEffectEvent(open);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const id = params.get(parameter);
    if (id === null) return;
    const controller = new AbortController();
    const { signal } = controller;

    const resolve = async () => {
      const record = id ? await loadRecord(id, signal).catch(() => undefined) : undefined;
      if (signal.aborted) return;
      if (record === undefined) enqueueSnackbar(unavailableMessage, { variant: "info" });
      else openRecord(record);
      params.delete(parameter);
      navigate({ pathname, search: params.toString(), hash }, { replace: true, state });
    };
    void resolve();
    return () => controller.abort();
  }, [pathname, search, hash, state, key, parameter, navigate, enqueueSnackbar, unavailableMessage]);
}
