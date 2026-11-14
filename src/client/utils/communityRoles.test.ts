import { describe, it, expect } from "vitest";
import type { Community } from "@shared/communities";
import { canGrantClient, canManageRoleClient, rankOf, roleMemberCount } from "./communityRoles";

const role = (_id: string, position: number, everyone = false) => ({
  _id,
  name: _id,
  color: "",
  position,
  permissions: [],
  everyone,
});
const community = {
  ownerId: "a",
  members: [
    { user_id: "a", role: "owner", roleIds: [], joinedAt: "" },
    { user_id: "b", role: "member", roleIds: ["admin"], joinedAt: "" },
    { user_id: "c", role: "member", roleIds: [], joinedAt: "" },
  ],
  roles: [role("owner-ish", 3), role("admin", 2), role("low", 1), role("e", 0, true)],
  permissions: ["manageRoles", "pinMessages"],
} as unknown as Community;

describe("role rules", () => {
  it("ranks the owner above everyone, others by their highest role", () => {
    expect(rankOf(community, "a")).toBe(Infinity);
    expect(rankOf(community, "b")).toBe(2);
    expect(rankOf(community, "c")).toBe(0);
    expect(rankOf(community, "nobody")).toBe(-1);
  });

  it("the owner can change any role; others only roles below their own", () => {
    const asOwner = { ...community, permissions: [] } as Community;
    expect(canManageRoleClient(asOwner, "a", role("owner-ish", 3))).toBe(true);
    expect(canManageRoleClient(community, "b", role("low", 1))).toBe(true);
    expect(canManageRoleClient(community, "b", role("admin", 2))).toBe(false);
    expect(canManageRoleClient(community, "b", role("owner-ish", 3))).toBe(false);
    expect(canManageRoleClient(community, "b", role("e", 0, true))).toBe(false);
  });

  it("needs manage roles at all", () => {
    expect(canManageRoleClient({ ...community, permissions: ["pinMessages"] } as Community, "b", role("low", 1))).toBe(
      false,
    );
  });

  it("only offers permissions the viewer holds", () => {
    expect(canGrantClient(community, "pinMessages")).toBe(true);
    expect(canGrantClient(community, "manageCommunity")).toBe(false);
  });

  it("counts people with a role, and everyone for the everyone role", () => {
    expect(roleMemberCount(community, role("admin", 2))).toBe(1);
    expect(roleMemberCount(community, role("low", 1))).toBe(0);
    expect(roleMemberCount(community, role("e", 0, true))).toBe(3);
  });
});
