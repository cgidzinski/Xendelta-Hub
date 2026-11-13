import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { memberFields } from "../utils/membership";
import { DEFAULT_EVERYONE_PERMISSIONS, COMMUNITY_PERMISSIONS } from "@shared/communities";

// A community: a group's own place with channels, roles and members. The channels are conversations that point back here
// (see models/conversation.ts), and their messages live in models/message.ts, so a busy community never grows this document.
//
// Members use the standard shape of utils/membership.ts with two roles, one owner and any number of members. What a
// member may do comes from `roleIds` and the `everyone` role (see communities/policy.ts).
const communityRoleSchema = new Schema({
  name: { type: String, required: true },
  color: { type: String, default: "" },
  position: { type: Number, default: 0 },
  permissions: [{ type: String, enum: COMMUNITY_PERMISSIONS }],
  // The role every member has. There is exactly one per community and it cannot be deleted.
  everyone: { type: Boolean, default: false },
});

const communityMemberSchema = new Schema(
  {
    user_id: memberFields.user_id,
    role: { type: String, enum: ["owner", "member"], default: "member" },
    roleIds: [{ type: String }],
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const communitySchema = new Schema(
  {
    name: { type: String, required: true },
    icon: { type: String, default: null },
    members: [communityMemberSchema],
    roles: {
      type: [communityRoleSchema],
      // Every community starts with the role everyone has.
      default: () => [
        { name: "everyone", position: 0, everyone: true, permissions: [...DEFAULT_EVERYONE_PERMISSIONS] },
      ],
    },
  },
  { timestamps: true },
);

// "My communities".
communitySchema.index({ "members.user_id": 1 });

export type CommunityAttrs = InferSchemaType<typeof communitySchema>;
export type CommunityDocument = HydratedDocument<CommunityAttrs>;

export const Community = mongoose.model("Community", communitySchema);
