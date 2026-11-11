import { z } from "zod";
import { objectIdSchema } from "./core";

// The route normalises these (trim, clamp quantity); this only rejects the wrong *types* and
// absurd sizes before they reach it. Unknown keys pass through, as before.
const text = (max: number) => z.string().max(max).nullish();

export const paintBodySchema = z.looseObject({
  brand: text(200),
  name: text(200),
  range: text(200),
  hex: text(16),
  type: text(50),
  catalogueKey: text(500),
  quantity: z.union([z.number(), z.string().max(20)]).nullish(),
});

export const paintIdParamSchema = z.object({ paintId: objectIdSchema });
