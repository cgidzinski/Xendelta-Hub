import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { memberFields } from "../utils/membership";
import { DEFAULT_EVERYONE_PERMISSIONS, SPACE_PERMISSIONS } from "@shared/spaces";

// A space: a group's own place with channels, roles and members. The channels are conversations that point back here
// (see models/conversation.ts), and their messages live in models/message.ts, so a busy space never grows this document.
//
// Members use the standard shape of utils/membership.ts with two roles, one owner and any number of members. What a
// member may do comes from `roleIds` and the `everyone` role (see spaces/policy.ts).
const spaceRoleSchema = new Schema({
  name: { type: String, required: true },
  color: { type: String, default: "" },
  position: { type: Number, default: 0 },
  permissions: [{ type: String, enum: SPACE_PERMISSIONS }],
  // The role every member has. There is exactly one per space and it cannot be deleted.
  everyone: { type: Boolean, default: false },
});

const spaceMemberSchema = new Schema(
  {
    user_id: memberFields.user_id,
    role: { type: String, enum: ["owner", "member"], default: "member" },
    roleIds: [{ type: String }],
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const spaceSchema = new Schema(
  {
    name: { type: String, required: true },
    icon: { type: String, default: null },
    members: [spaceMemberSchema],
    roles: {
      type: [spaceRoleSchema],
      // Every space starts with the role everyone has.
      default: () => [
        { name: "everyone", position: 0, everyone: true, permissions: [...DEFAULT_EVERYONE_PERMISSIONS] },
      ],
    },
  },
  { timestamps: true },
);

// "My spaces".
spaceSchema.index({ "members.user_id": 1 });

export type SpaceAttrs = InferSchemaType<typeof spaceSchema>;
export type SpaceDocument = HydratedDocument<SpaceAttrs>;

export const Space = mongoose.model("Space", spaceSchema);
