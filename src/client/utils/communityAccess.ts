import type { ChannelOverride } from "@shared/communities";

/** How a channel is opened up. "Custom" is anything the presets can't describe (set elsewhere, or by hand). */
export type ChannelAccess = "open" | "readonly" | "private" | "custom";

export interface AccessChoice {
  mode: Exclude<ChannelAccess, "custom">;
  /** Roles let in on top of the mode: they can post in a read-only channel, or read a private one. */
  roleIds: string[];
}

/** The overrides that make a channel open, read-only for everyone, or private, with some roles let through. */
export function overridesFromAccess(choice: AccessChoice, everyoneId: string): ChannelOverride[] {
  if (choice.mode === "open") return [];
  const deny = choice.mode === "private" ? "readMessages" : "sendMessages";
  // A role let into a private channel can read and post; one let into a read-only channel can post.
  const allow = choice.mode === "private" ? (["readMessages", "sendMessages"] as const) : (["sendMessages"] as const);
  return [
    { roleId: everyoneId, allow: [], deny: [deny] },
    ...[...new Set(choice.roleIds)]
      .filter((id) => id !== everyoneId)
      .map((roleId) => ({ roleId, allow: [...allow], deny: [] })),
  ];
}

/** What a channel's overrides say, in the terms of the presets above. */
export function accessFromOverrides(
  overrides: ChannelOverride[],
  everyoneId: string,
): { access: ChannelAccess; roleIds: string[] } {
  if (overrides.length === 0) return { access: "open", roleIds: [] };
  const base = overrides.find((o) => o.roleId === everyoneId);
  const others = overrides.filter((o) => o.roleId !== everyoneId);
  if (!base || base.allow.length > 0) return { access: "custom", roleIds: [] };
  const mode =
    base.deny.length === 1 && base.deny[0] === "readMessages"
      ? "private"
      : base.deny.length === 1 && base.deny[0] === "sendMessages"
        ? "readonly"
        : null;
  if (!mode) return { access: "custom", roleIds: [] };
  // Every other override must be exactly what the preset would write for that role.
  const expected = overridesFromAccess({ mode, roleIds: others.map((o) => o.roleId) }, everyoneId).slice(1);
  const same = others.every((o, i) => {
    const e = expected[i]!;
    return o.deny.length === 0 && [...o.allow].sort().join() === [...e.allow].sort().join();
  });
  return same ? { access: mode, roleIds: others.map((o) => o.roleId) } : { access: "custom", roleIds: [] };
}
