import { useEffect, useRef } from "react";
import { ShotResult } from "../../../../../shared/pachinko/pachinkoPhysics";
import { PachinkoSimRequest, PachinkoSimResponse } from "./pachinkoSimWorker";

// One dedicated worker per mounted board, reused across every shot rather than spun up per-ball
// - creating a Worker has real overhead, and this one only ever needs to process one shot at a
// time (each simulateShot() run costs tens of ms, well under the 400ms hold-to-fire cadence).
// Multiple in-flight requests are fine even so: the worker's own message queue just processes
// them in the order they arrive, each response correlated back to its own caller by requestId.
let nextRequestId = 0;

export interface PachinkoSimParams {
    seed: number;
    launchPower: number;
    chuckerActive: boolean;
    attackerActive: boolean;
    jackpotActive: boolean;
}

export function usePachinkoSimWorker() {
    const workerRef = useRef<Worker | null>(null);
    const pendingRef = useRef<Map<number, (result: ShotResult) => void>>(new Map());

    useEffect(() => {
        const worker = new Worker(new URL("./pachinkoSimWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<PachinkoSimResponse>) => {
            const { requestId, result } = event.data;
            const resolve = pendingRef.current.get(requestId);
            if (resolve) {
                pendingRef.current.delete(requestId);
                resolve(result);
            }
        };
        workerRef.current = worker;
        return () => {
            worker.terminate();
            workerRef.current = null;
            pendingRef.current.clear();
        };
    }, []);

    const simulate = (params: PachinkoSimParams): Promise<ShotResult> => {
        return new Promise((resolve) => {
            const worker = workerRef.current;
            if (!worker) {
                // Not mounted yet (shouldn't happen in practice - the board renders the worker's
                // owning effect before any shot can fire) - resolve with a harmless miss rather
                // than hang the caller forever. The server's /confirm replay is what actually
                // decides the shot regardless, so this only ever affects the local preview.
                resolve({ trajectory: [], outcome: "gutter" });
                return;
            }
            const requestId = nextRequestId++;
            pendingRef.current.set(requestId, resolve);
            const request: PachinkoSimRequest = { requestId, ...params };
            worker.postMessage(request);
        });
    };

    return { simulate };
}
