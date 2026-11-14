import { z } from "zod";
import { objectIdSchema } from "./core";

const trackName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid track name");
const mid = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, "Invalid mid");
const sdp = z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(200_000) });

export const callParamSchema = z.object({ conversationId: objectIdSchema });

export const joinCallSchema = z.object({ video: z.boolean().default(false) });

/** Publish (`local`) or pull (`remote`) tracks. */
export const callTracksSchema = z.object({
  sessionDescription: sdp.optional(),
  tracks: z
    .array(
      z.discriminatedUnion("location", [
        z.object({ location: z.literal("local"), mid, trackName }),
        z.object({ location: z.literal("remote"), sessionId: z.string().regex(/^[A-Za-z0-9]{8,64}$/), trackName }),
      ]),
    )
    .min(1)
    .max(10),
});

export const callRenegotiateSchema = z.object({ sessionDescription: sdp.extend({ type: z.literal("answer") }) });

export const callCloseTracksSchema = z.object({
  tracks: z.array(z.object({ mid })).min(1).max(10),
  force: z.boolean().optional(),
  sessionDescription: sdp.optional(),
});

/** What a person says about their own media; the others show it. */
export const callStateSchema = z
  .object({
    tracks: z
      .object({ audio: trackName.optional(), video: trackName.optional(), screen: trackName.optional() })
      .optional(),
    muted: z.boolean().optional(),
    cameraOn: z.boolean().optional(),
    screenOn: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });
