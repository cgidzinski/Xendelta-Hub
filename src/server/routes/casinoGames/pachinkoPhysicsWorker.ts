/**
 * Piscina worker entry point - runs Pachinko's CPU-bound physics simulation
 * (`pachinkoPhysics.ts`'s `simulateShot`) on a background thread instead of the main event loop.
 * See pachinko-network-error-investigation.md (git history, commit 1fefd1b) for why: a full
 * matter-js simulation (up to 2000 `Engine.update()` calls, building a fresh physics world per
 * shot) run synchronously inside the `/launch` request handler could block the single Node
 * event loop long enough, under sustained hold-to-fire, to exceed the client's own timeout and
 * surface as a misleading "Network error" toast.
 *
 * Deliberately a thin wrapper - `simulateShot` itself is unchanged, already a clean, pure,
 * side-effect-free function (builds its own fresh Matter.Engine per call, no shared mutable
 * state, no Express/req/res dependency), which is exactly what makes it safe to run off-thread
 * with no modification.
 */
import { simulateShot } from "./pachinkoPhysics";

export interface PachinkoPhysicsTask {
    launchPower: number;
    chuckerActive: boolean;
    attackerActive: boolean;
    jackpotActive: boolean;
}

export default function runPachinkoPhysics(task: PachinkoPhysicsTask) {
    return simulateShot(task.launchPower, task.chuckerActive, task.attackerActive, task.jackpotActive);
}
