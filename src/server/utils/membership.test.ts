import { describe, it, expect } from "vitest";
import {
  roleOf,
  canView,
  canEdit,
  canManage,
  changeRole,
  removeMember,
  legacyRoster,
  accessOf,
  type HasMembers,
} from "./membership";

const doc: HasMembers = {
  members: [
    { user_id: "o", role: "owner" },
    { user_id: "e", role: "editor" },
    { user_id: "v", role: "viewer" },
  ],
};

describe("roles", () => {
  it("reads a member's role, and null for a stranger or a missing doc", () => {
    expect(roleOf(doc, "e")).toBe("editor");
    expect(roleOf(doc, "x")).toBeNull();
    expect(roleOf(null, "o")).toBeNull();
    expect(roleOf(undefined, "o")).toBeNull();
  });

  it("viewers read, editors and owners change things, only the owner manages", () => {
    expect(["o", "e", "v", "x"].map((u) => canView(doc, u))).toEqual([true, true, true, false]);
    expect(["o", "e", "v", "x"].map((u) => canEdit(doc, u))).toEqual([true, true, false, false]);
    expect(["o", "e", "v", "x"].map((u) => canManage(doc, u))).toEqual([true, false, false, false]);
  });
});

describe("changeRole", () => {
  it("only the owner may change roles", () => {
    expect(changeRole(doc, "e", "v", "editor")).toMatchObject({ ok: false, code: 403 });
  });

  it("404s for someone who is not a member", () => {
    expect(changeRole(doc, "o", "x", "editor")).toMatchObject({ ok: false, code: 404 });
  });

  it("changes a role without touching anyone else", () => {
    const r = changeRole(doc, "o", "v", "editor");
    expect(r.ok && r.members.map((m) => m.role)).toEqual(["owner", "editor", "editor"]);
  });

  it("handing over ownership demotes the old owner so there is exactly one", () => {
    const r = changeRole(doc, "o", "e", "owner");
    expect(r.ok && r.members.map((m) => [m.user_id, m.role])).toEqual([
      ["o", "editor"],
      ["e", "owner"],
      ["v", "viewer"],
    ]);
  });

  it("the owner cannot demote themselves without naming a successor", () => {
    expect(changeRole(doc, "o", "o", "editor")).toMatchObject({ ok: false, code: 400 });
  });
});

describe("removeMember", () => {
  it("the owner removes anyone else", () => {
    const r = removeMember(doc, "o", "v");
    expect(r.ok && r.members.map((m) => m.user_id)).toEqual(["o", "e"]);
  });

  it("a member may remove only themselves", () => {
    expect(removeMember(doc, "e", "e").ok).toBe(true);
    expect(removeMember(doc, "e", "v")).toMatchObject({ ok: false, code: 403 });
  });

  it("the owner cannot leave", () => {
    expect(removeMember(doc, "o", "o")).toMatchObject({ ok: false, code: 400 });
  });

  it("a stranger learns nothing (404)", () => {
    expect(removeMember(doc, "x", "e")).toMatchObject({ ok: false, code: 404 });
    expect(removeMember(doc, "o", "x")).toMatchObject({ ok: false, code: 404 });
  });
});

describe("legacy shape (members + created_by)", () => {
  it("the creator is the owner and everyone else an editor", () => {
    expect(legacyRoster({ created_by: "a", members: ["a", "b"] })).toEqual([
      { user_id: "a", role: "owner" },
      { user_id: "b", role: "editor" },
    ]);
  });

  it("reads ObjectId-like and populated members, and drops duplicates", () => {
    const oid = (s: string) => ({ toString: () => s });
    expect(legacyRoster({ created_by: "a", members: [oid("a"), { _id: oid("b") }, "b"] })).toEqual([
      { user_id: "a", role: "owner" },
      { user_id: "b", role: "editor" },
    ]);
  });

  it("an owner who is not in members gets no access (as before)", () => {
    expect(legacyRoster({ created_by: "z", members: ["a"] })).toEqual([{ user_id: "a", role: "editor" }]);
    expect(canView(accessOf({ created_by: "z", members: ["a"] }), "z")).toBe(false);
  });

  it("handles missing fields", () => {
    expect(legacyRoster({})).toEqual([]);
    expect(legacyRoster(null)).toEqual([]);
  });
});
