import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { COMMUNITY_INVITE_DAYS } from "@shared/communities";

// An invitation to join a community, sent to a person who already has an account. There are no invite links: nobody can
// join without being asked, and only the person asked can say yes. It goes away when answered, taken back, or after
// COMMUNITY_INVITE_DAYS.
const communityInviteSchema = new Schema(
  {
    communityId: { type: String, required: true },
    // The person invited, and the member who invited them.
    userId: { type: String, required: true },
    invitedBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One open invite per person per community.
communityInviteSchema.index({ communityId: 1, userId: 1 }, { unique: true });
// "My invites".
communityInviteSchema.index({ userId: 1, createdAt: -1 });
// The rate limit counts what one person sent recently.
communityInviteSchema.index({ invitedBy: 1, createdAt: -1 });
communityInviteSchema.index({ createdAt: 1 }, { expireAfterSeconds: COMMUNITY_INVITE_DAYS * 24 * 60 * 60 });

export type CommunityInviteAttrs = InferSchemaType<typeof communityInviteSchema>;
export type CommunityInviteDocument = HydratedDocument<CommunityInviteAttrs>;

export const CommunityInvite = mongoose.model("CommunityInvite", communityInviteSchema);
