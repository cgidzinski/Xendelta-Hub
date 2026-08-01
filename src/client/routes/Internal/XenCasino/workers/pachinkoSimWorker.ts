/**
 * Runs the exact same isomorphic pachinkoPhysics.simulateShot() the server later replays
 * authoritatively (see pachinko.ts's confirmTicket), off the main thread so a burst of
 * hold-to-fire shots can't jank the board's own canvas rendering - the same reason the server
 * runs its own replay on a Piscina worker pool instead of inline.
 *
 * Purely a preview: nothing this worker produces is ever sent to the server or trusted for
 * scoring - the client only uses its result to animate the ball immediately, while the real
 * outcome comes back later from POST /launch/confirm. See pachinkoPhysics.ts's own header for
 * why the two can occasionally disagree (cross-environment float drift) and why that's fine -
 * the server's replay always wins.
 */
import { simulateShot, ShotResult } from "../../../../../shared/pachinko/pachinkoPhysics";
import { mulberry32 } from "../../../../../shared/pachinko/prng";

export interface PachinkoSimRequest {
    requestId: number;
    seed: number;
    launchPower: number;
    chuckerActive: boolean;
    attackerActive: boolean;
    jackpotActive: boolean;
}

export interface PachinkoSimResponse {
    requestId: number;
    result: ShotResult;
}

self.onmessage = (event: MessageEvent<PachinkoSimRequest>) => {
    const { requestId, seed, launchPower, chuckerActive, attackerActive, jackpotActive } = event.data;
    const result = simulateShot(launchPower, chuckerActive, attackerActive, jackpotActive, mulberry32(seed));
    const response: PachinkoSimResponse = { requestId, result };
    (self as unknown as Worker).postMessage(response);
};
