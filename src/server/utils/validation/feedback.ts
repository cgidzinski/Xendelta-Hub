import { z } from "zod";
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_REWARD_MAX_GEMS,
  FEEDBACK_REWARD_MESSAGE_MAX_LENGTH,
  FEEDBACK_STATUSES,
} from "../../../shared/feedback";
import { objectIdSchema } from "./core";

export const sendFeedbackSchema = z.object({
  message: z.string().trim().min(FEEDBACK_MIN_LENGTH).max(FEEDBACK_MAX_LENGTH),
});

export const adminFeedbackIdParamSchema = z.object({ id: objectIdSchema });
export const adminFeedbackUpdateSchema = z.object({ status: z.enum(FEEDBACK_STATUSES) });
export const adminFeedbackResolveSchema = z.object({
  // 0 means a message only, no gems.
  gems: z.number().int().min(0).max(FEEDBACK_REWARD_MAX_GEMS),
  message: z.string().trim().min(1).max(FEEDBACK_REWARD_MESSAGE_MAX_LENGTH),
});
export const adminFeedbackQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
