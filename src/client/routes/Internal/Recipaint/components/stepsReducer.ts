import { RecipeStep } from "../../../../types/RecipeStep";

export type StepAction =
  | { type: "reset"; steps: RecipeStep[] }
  | { type: "add" }
  | { type: "update"; index: number; step: RecipeStep }
  | { type: "delete"; index: number }
  | { type: "move"; index: number; direction: "up" | "down" }
  /** Put the step at `from` at position `to` (drag to reorder). */
  | { type: "moveTo"; from: number; to: number };

export const emptyStep = (index: number): RecipeStep => ({
  index,
  stepName: "",
  method: "",
  images: [],
  text: "",
  paints: [],
});

// `index` is persisted on each step, so anything that shifts positions has to renumber.
const reindex = (steps: RecipeStep[]): RecipeStep[] =>
  steps.map((step, i) => (step.index === i ? step : { ...step, index: i }));

function moveTo(steps: RecipeStep[], from: number, to: number): RecipeStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps;
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return reindex(next);
}

export function stepsReducer(steps: RecipeStep[], action: StepAction): RecipeStep[] {
  switch (action.type) {
    case "reset":
      return action.steps;
    case "add":
      return [...steps, emptyStep(steps.length)];
    case "update": {
      // Replace one entry so the other steps keep their object identity and memoized
      // StepEditors skip re-rendering - otherwise every keystroke re-rendered every step.
      const next = [...steps];
      next[action.index] = action.step;
      return next;
    }
    case "delete":
      return reindex(steps.filter((_, i) => i !== action.index));
    case "move":
      return moveTo(steps, action.index, action.direction === "up" ? action.index - 1 : action.index + 1);
    case "moveTo":
      return moveTo(steps, action.from, action.to);
  }
}

/**
 * Where a dragged step would land. `midpoints` are the vertical centres of the step cards in order; the slot is the gap
 * the pointer is in (0 = above the first card, `midpoints.length` = below the last). Returns that slot and the index the
 * dragged step would end up at, which equals `from` when dropping there changes nothing.
 */
export function dropTarget(midpoints: number[], pointerY: number, from: number): { slot: number; to: number } {
  let slot = 0;
  while (slot < midpoints.length && pointerY > midpoints[slot]) slot++;
  return { slot, to: slot > from ? slot - 1 : slot };
}
