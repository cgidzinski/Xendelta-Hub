import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Portal, Snackbar } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeTimerClock,
  startTimerClock,
  TIMER_PATH,
  TIMER_RETENTION_MS,
  type KitchenTimer,
  type StartKitchenTimer,
  type TimerAction,
  type TimerSource,
} from "@shared/xenkitchen/timers";
import { api } from "../../../../config/api";
import { browserStorage, readStored, writeStored } from "../../../../hooks/useLocalStorageState";
import { useSocketInvalidate } from "../../../../hooks/useSocketEvent";
import { playTimerAlarm, prepareTimerAudio } from "../cook/alarm";
import { sortTimers, timerAlert, timerVisible } from "./timerDisplay";
import { TimerDialog } from "./TimerDialog";

export interface TimerDraft {
  durationSeconds: number;
  halfway: boolean;
  source?: TimerSource;
}

type TimerPanel = { view: "list"; highlight?: string } | { view: "new"; preset?: TimerDraft };
interface TimerState {
  timers: KitchenTimer[];
  now: number;
  panel: TimerPanel | null;
  busy: ReadonlySet<string>;
  loading: boolean;
  unavailable: boolean;
  notice: string | null;
  dismissNotice: () => void;
  error: { message: string; retry?: () => void } | null;
  open: (highlight?: string) => void;
  edit: (preset?: TimerDraft) => void;
  close: () => void;
  retryList: () => void;
  clearError: () => void;
  start: (draft: TimerDraft, fromForm?: boolean) => Promise<void>;
  act: (timer: KitchenTimer, action: TimerAction) => Promise<void>;
}

const TimerContext = createContext<TimerState | null>(null);
export function useTimers() {
  const context = useContext(TimerContext);
  if (!context) throw new Error("Missing XenKitchen timer provider");
  return context;
}

const isTimerList = (value: unknown): value is KitchenTimer[] =>
  Array.isArray(value) &&
  value.every(
    (timer) =>
      timer && typeof timer.id === "string" && typeof timer.label === "string" && typeof timer.version === "number",
  );
const isAlertHistory = (value: unknown): value is Record<string, number> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value).every((at) => typeof at === "number");
const EMPTY_TIMERS: KitchenTimer[] = [];

export function TimerProvider({ owner, children }: { owner?: string; children: ReactNode }) {
  const cacheKey = `xenkitchen-timers:${owner ?? "guest"}`;
  const queryKey = ["xenkitchen", "timers", owner ?? "guest"];
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    enabled: !!owner,
    queryFn: ({ signal }) => api.get<KitchenTimer[]>(TIMER_PATH, { signal }),
    initialData: () => readStored<KitchenTimer[] | undefined>(browserStorage(), cacheKey, isTimerList, undefined),
    initialDataUpdatedAt: 0,
  });
  useSocketInvalidate("xenkitchen:timers_updated", [queryKey], () => !!owner);
  const records = query.data ?? EMPTY_TIMERS;

  const [clock, setClock] = useState(Date.now);
  const [panel, setPanel] = useState<TimerPanel | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(new Set<string>());
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<TimerState["error"]>(null);

  useEffect(() => {
    if (query.data) writeStored(browserStorage(), cacheKey, query.data);
  }, [cacheKey, query.data]);

  useEffect(
    () => () => {
      if (audio.current) void audio.current.close().catch(() => {});
      audio.current = null;
    },
    [],
  );

  const ticking = records.some((timer) => timer.endAt !== null && timer.endAt > clock);
  const nextExpiry = records.reduce((next, timer) => {
    if (timer.endAt === null || !timerVisible(timer, clock)) return next;
    return Math.min(next, timer.endAt + TIMER_RETENTION_MS);
  }, Infinity);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    document.addEventListener("visibilitychange", tick);
    const interval = ticking ? window.setInterval(tick, 250) : undefined;
    const expiry = Number.isFinite(nextExpiry)
      ? window.setTimeout(tick, Math.max(0, nextExpiry - Date.now()))
      : undefined;
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.clearInterval(interval);
      window.clearTimeout(expiry);
    };
  }, [ticking, nextExpiry]);

  const now = Math.max(clock, Date.now());
  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    const historyKey = `${cacheKey}:alerts`;
    const candidates = records.flatMap((timer) => {
      const event = timerAlert(timer, now);
      const key = `${timer.id}:${event?.kind}`;
      return event && timerVisible(timer, now) && !seen.current[key] ? [{ timer, key, ...event }] : [];
    });
    if (!candidates.length) return;
    const history = readStored(browserStorage(), historyKey, isAlertHistory, {});
    const alerts = candidates.filter(({ key }) => !history[key]);
    for (const { key, at } of candidates) seen.current[key] = at;
    if (!alerts.length) return;
    for (const { key, at } of alerts) history[key] = at;
    writeStored(
      browserStorage(),
      historyKey,
      Object.fromEntries(Object.entries(history).filter(([, at]) => at + TIMER_RETENTION_MS > now)),
    );
    setNotice(
      alerts.map(({ timer, kind }) => `${kind === "done" ? "Timer done" : "Halfway"} · ${timer.label}`).join("\n"),
    );
    const fresh = alerts.filter(({ at }) => now - at < 2000);
    if (fresh.length) playTimerAlarm(audio.current, fresh.some(({ kind }) => kind === "done") ? "done" : "halfway");
  }, [cacheKey, now, records]);

  const open = useCallback((highlight?: string) => {
    audio.current = prepareTimerAudio(audio.current);
    setPanel({ view: "list", highlight });
  }, []);
  const edit = (preset?: TimerDraft) => {
    setError(null);
    setPanel({ view: "new", preset });
  };
  const retryList = () => {
    void query.refetch();
  };

  async function run(key: string, task: () => Promise<void>, failure: string) {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setBusy(new Set(pending.current));
    setError(null);
    try {
      await task();
    } catch {
      setError({
        message: failure,
        retry: () => {
          void run(key, task, failure);
        },
      });
      if (owner) void queryClient.invalidateQueries({ queryKey });
    } finally {
      pending.current.delete(key);
      setBusy(new Set(pending.current));
    }
  }

  async function saveResult(id: string, timer: KitchenTimer | null) {
    if (owner) await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<KitchenTimer[]>(queryKey, (old = []) => {
      const current = old.find((entry) => entry.id === id);
      if (timer && current && current.version > timer.version) return old;
      return timer ? [...old.filter((entry) => entry.id !== id), timer] : old.filter((entry) => entry.id !== id);
    });
    if (owner) void queryClient.invalidateQueries({ queryKey });
  }

  async function start(draft: TimerDraft, fromForm = false) {
    const input: StartKitchenTimer = { ...draft, id: globalThis.crypto.randomUUID() };
    audio.current = prepareTimerAudio(audio.current);
    await run(
      fromForm ? "new" : (draft.source?.key ?? "new"),
      async () => {
        let timer: KitchenTimer;
        if (owner) {
          timer = await api.post<KitchenTimer>(TIMER_PATH, input);
        } else {
          const current = queryClient.getQueryData<KitchenTimer[]>(queryKey) ?? EMPTY_TIMERS;
          const sameSource =
            input.source &&
            current.find((entry) => entry.sourceKey === input.source?.key && timerVisible(entry, Date.now()));
          const labels = new Set(current.map((entry) => entry.label));
          let number = 1;
          while (labels.has(`Timer ${number}`)) number++;
          timer = sameSource || {
            id: input.id,
            label: input.source?.label ?? `Timer ${number}`,
            sourceKey: input.source?.key,
            durationSeconds: input.durationSeconds,
            ...startTimerClock(input.durationSeconds, input.halfway, Date.now()),
            version: 0,
          };
        }
        await saveResult(timer.id, timer);
        if (fromForm) setPanel((active) => (active?.view === "new" ? { view: "list", highlight: timer.id } : active));
      },
      "Couldn’t start the timer.",
    );
  }

  async function act(timer: KitchenTimer, action: TimerAction) {
    if (action === "resume") audio.current = prepareTimerAudio(audio.current);
    await run(
      timer.id,
      async () => {
        if (owner) {
          const updated = await api.patch<KitchenTimer | null>(`${TIMER_PATH}/${timer.id}`, {
            action,
            version: timer.version,
          });
          await saveResult(timer.id, updated);
          return;
        }
        if (action === "dismiss") {
          await saveResult(timer.id, null);
          return;
        }
        const updated = changeTimerClock(timer, action, Date.now());
        if (updated) await saveResult(timer.id, updated);
      },
      "Couldn’t update the timer.",
    );
  }

  const state: TimerState = {
    timers: sortTimers(
      records.filter((timer) => timerVisible(timer, now)),
      now,
    ),
    now,
    panel,
    busy,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    loading: !!owner && query.isPending,
    unavailable: !!owner && query.isError,
    open,
    edit,
    close: () => {
      setPanel(null);
      setError(null);
    },
    retryList,
    clearError: () => setError(null),
    start,
    act,
  };

  return (
    <TimerContext.Provider value={state}>
      {children}
      {panel && <TimerDialog />}
      {!panel && (notice || error) && (
        <Portal>
          <Snackbar
            open={!!notice || !!error}
            autoHideDuration={notice ? 8500 : undefined}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
            onClose={(_, reason) => {
              if (reason !== "clickaway") setNotice(null);
            }}
          >
            <Alert
              severity={notice ? "info" : "error"}
              role={notice ? "status" : "alert"}
              onClose={() => (notice ? setNotice(null) : setError(null))}
              action={
                notice ? (
                  <Button
                    color="inherit"
                    onClick={() => {
                      setNotice(null);
                      open();
                    }}
                  >
                    Timers
                  </Button>
                ) : (
                  error?.retry && (
                    <Button color="inherit" onClick={error.retry}>
                      Retry
                    </Button>
                  )
                )
              }
              sx={{ whiteSpace: "pre-line", width: "100%" }}
            >
              {notice ?? error?.message}
            </Alert>
          </Snackbar>
        </Portal>
      )}
    </TimerContext.Provider>
  );
}
