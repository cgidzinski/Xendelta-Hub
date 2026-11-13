import { z } from "zod";
import { objectIdSchema } from "./core";
import { SPACE_NAME_MAX } from "../../../shared/spaces";

export const spaceParamSchema = z.object({ spaceId: objectIdSchema });
export const spaceMemberParamSchema = z.object({ spaceId: objectIdSchema, userId: objectIdSchema });

const spaceName = z.string().trim().min(1, "Give the space a name").max(SPACE_NAME_MAX);

export const createSpaceSchema = z.object({ name: spaceName });
export const renameSpaceSchema = z.object({ name: spaceName });
/** Hand the space to another member. */
export const spaceOwnerSchema = z.object({ userId: objectIdSchema });
