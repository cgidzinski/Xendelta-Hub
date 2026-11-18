import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guardrail for cosmetics (docs/monetization.md): a person's picture is drawn with `UserAvatar`, so the frame they
// wear shows up everywhere at once. A raw MUI `<Avatar src={...avatar...}>` skips the frame, so it fails here.
//
// Files below still draw one because the person's cosmetics aren't passed down to them yet (they only get an avatar
// string). Fix one by passing the person instead, then delete its line: the test also fails for a listed file that no
// longer needs the exception, so the list can only shrink.

const ROOT = join(__dirname);

const NOT_YET: Record<string, string> = {
  "routes/Internal/Settings/components/AvatarUploadSection.tsx":
    "shows an upload preview, not someone's public picture",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

/** Opening tags of raw `<Avatar ...>` elements in a source file (not `AvatarGroup`, not `UserAvatar`). */
function avatarTags(source: string): string[] {
  const tags: string[] = [];
  const open = /<Avatar(?=[\s>/])/g;
  for (let m = open.exec(source); m; m = open.exec(source)) {
    let depth = 0;
    let end = m.index;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(source.slice(m.index, end + 1));
  }
  return tags;
}

const showsAUsersPicture = (tag: string) => /\bsrc=\{[^}]*avatar/i.test(tag);

describe("user pictures use UserAvatar", () => {
  const offenders = new Map<string, number>();
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file).split("\\").join("/");
    if (rel === "components/user/UserAvatar.tsx") continue;
    const count = avatarTags(readFileSync(file, "utf8")).filter(showsAUsersPicture).length;
    if (count > 0) offenders.set(rel, count);
  }

  it("no raw <Avatar> shows a user's picture, except the listed files", () => {
    const unlisted = [...offenders.keys()].filter((f) => !(f in NOT_YET));
    expect(unlisted, "draw it with <UserAvatar user={person}> (components/user/UserAvatar.tsx)").toEqual([]);
  });

  it("lists only files that still need the exception", () => {
    const stale = Object.keys(NOT_YET).filter((f) => !offenders.has(f));
    expect(stale, "these no longer draw a raw <Avatar>: remove them from NOT_YET").toEqual([]);
  });
});
