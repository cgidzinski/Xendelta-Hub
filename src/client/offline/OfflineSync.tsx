import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useAuth } from "../contexts/AuthContext";
import { api, apiClient } from "../config/api";
import { xennoteKeys } from "../hooks/xennote/keys";
import { routineKeys } from "../hooks/xenroutine/useRoutines";
import { useOnlineStatus } from "../pwa/hooks/useOnlineStatus";
import { overlayQueuedTicks, replayQueue, type QueuedAction } from "./offlineQueue";
import { offlineQueue, offlineStore } from "./offlineRuntime";
import { clearPersistedCache, restoreCache, startPersisting } from "./queryPersistence";

const RETRY_MS = 60_000;

const send = async (action: QueuedAction): Promise<void> => {
  if (action.kind === "note-tick") {
    await api.put(`/api/xennote/notes/${action.noteId}/checklist/${action.itemId}`, { done: action.done });
  } else {
    await apiClient.post(`/api/xenroutine/${action.routineId}/complete`, {
      occurrence: action.occurrence,
      expected_due_at: action.expectedDueAt,
    });
  }
};

/**
 * Keeps the offline copy of the app in step: restores what was saved last time, keeps saving it, sends the changes made
 * offline when the connection is back, and throws it all away when the person signs out. Renders nothing.
 */
export default function OfflineSync() {
  const { user, isAuthenticated } = useAuth();
  const online = useOnlineStatus();
  const client = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const userId = isAuthenticated ? user.id : undefined;
  const lastUser = useRef<string | undefined>(undefined);

  // Save the copy while signed in; delete it (and anything unsent) on sign-out or a change of person.
  useEffect(() => {
    if (!userId) {
      if (lastUser.current) {
        void clearPersistedCache(offlineStore);
        void offlineQueue.clearUser(lastUser.current);
        lastUser.current = undefined;
      }
      return;
    }
    lastUser.current = userId;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void restoreCache(client, offlineStore, userId)
      .then(async () => {
        // What was ticked offline shows even if the saved copy was taken before the tick.
        const queued = await offlineQueue.forUser(userId);
        client.setQueriesData<Array<{ _id: string; checklist: Array<{ _id?: string; done: boolean }> }>>(
          { queryKey: xennoteKeys.notesAll() },
          (old) => (old ? overlayQueuedTicks(old, queued) : old),
        );
      })
      .finally(() => {
        if (!cancelled) stop = startPersisting(client, offlineStore, userId);
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [userId, client]);

  // Send the queue: when the connection returns, when signing in, and now and then while changes are waiting.
  useEffect(() => {
    if (!userId || !online) return;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const result = await replayQueue(offlineQueue, userId, send);
        if (result.sent.length > 0) {
          void client.invalidateQueries({ queryKey: xennoteKeys.all });
          void client.invalidateQueries({ queryKey: routineKeys.all });
        }
        for (const { item, message } of result.dropped) {
          enqueueSnackbar(`Couldn't save “${item.label}”: ${message}`, { variant: "warning" });
        }
        if (result.dropped.length > 0) {
          void client.invalidateQueries({ queryKey: xennoteKeys.all });
          void client.invalidateQueries({ queryKey: routineKeys.all });
        }
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), RETRY_MS);
    const unsubscribe = offlineQueue.subscribe(() => void run());
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [userId, online, client, enqueueSnackbar]);

  return null;
}
