import type { Routine } from "../../../hooks/xenroutine/useRoutines";

/** What the XenRoutine layout hands to its tabs through <Outlet context>. */
export interface XenRoutineOutletContext {
  openCreate: () => void;
  openEdit: (routine: Routine) => void;
}
