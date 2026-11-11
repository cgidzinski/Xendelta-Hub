import { z } from "zod";
import { objectIdSchema } from "./core";

// Recipaint steps are rich nested objects the client owns the shape of; the server stores what
// it is given. So this checks the envelope (types, counts, sizes), not every step field.
const steps = z.array(z.looseObject({})).max(500);

export const recipeCreateSchema = z.looseObject({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().max(20_000).nullish(),
  showcase: z.array(z.string().max(2048)).max(100).nullish(),
  steps: steps.nullish(),
  isPublic: z.boolean().nullish(),
});

// Updates send the full set again; every field is optional so a partial edit still validates.
export const recipeUpdateSchema = recipeCreateSchema.partial();

export const recipeIdParamSchema = z.object({ id: objectIdSchema });
export const recipeProgressSchema = z.object({
  completedSteps: z.array(z.union([z.string(), z.number()])).max(5000),
});
export const recipeAssetQuerySchema = z.object({ assetUrl: z.string().min(1).max(2048) });
