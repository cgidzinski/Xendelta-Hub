import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { SPACE_INVITE_DAYS } from "@shared/spaces";

// An invitation to join a space, sent to a person who already has an account. There are no invite links: nobody can
// join without being asked, and only the person asked can say yes. It goes away when answered, taken back, or after
// SPACE_INVITE_DAYS.
const spaceInviteSchema = new Schema(
  {
    spaceId: { type: String, required: true },
    // The person invited, and the member who invited them.
    userId: { type: String, required: true },
    invitedBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One open invite per person per space.
spaceInviteSchema.index({ spaceId: 1, userId: 1 }, { unique: true });
// "My invites".
spaceInviteSchema.index({ userId: 1, createdAt: -1 });
// The rate limit counts what one person sent recently.
spaceInviteSchema.index({ invitedBy: 1, createdAt: -1 });
spaceInviteSchema.index({ createdAt: 1 }, { expireAfterSeconds: SPACE_INVITE_DAYS * 24 * 60 * 60 });

export type SpaceInviteAttrs = InferSchemaType<typeof spaceInviteSchema>;
export type SpaceInviteDocument = HydratedDocument<SpaceInviteAttrs>;

export const SpaceInvite = mongoose.model("SpaceInvite", spaceInviteSchema);
