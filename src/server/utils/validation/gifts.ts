import { z } from "zod";
import { objectIdSchema } from "./core";
import { GIFT_NOTE_MAX } from "@shared/billing";

// Giving gems to another person (billing/gifts.ts). `requestId` comes from the client so a retried request can't give twice.
export const giftGemsSchema = z.object({
  toUserId: objectIdSchema,
  gems: z.number().int("Give whole gems").min(1, "Give at least 1 gem").max(1_000_000),
  note: z.string().trim().max(GIFT_NOTE_MAX, `Keep the note to ${GIFT_NOTE_MAX} characters`).optional(),
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Invalid request id"),
});
