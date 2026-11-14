import { routineKeys } from "./useRoutines";
import { useSocketInvalidate } from "../useSocketEvent";

/**
 * Keeps the routine list live. Routines are shared — a tick, a completion, a postponement or an edit by anyone on the
 * routine changes what you see — and `routineKeys.all` also covers the reminder settings read alongside the list.
 */
export function useRoutineSocket() {
  useSocketInvalidate("xenroutine:update", [routineKeys.all]);
}
