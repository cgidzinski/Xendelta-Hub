import type { ChatPerson } from "@shared/chat";
import { MENTION_TOKEN, mentionToken } from "@shared/mentions";

// Mentions in the message box. Someone types `@sam` and sees `@sam`; the message is stored with `<@id>` in its place, so
// a later rename can't break it. These turn one into the other.

export interface MentionMatch {
  /** Where the @ is. */
  start: number;
  /** What follows it so far (may be empty). */
  query: string;
}

/** The `@partial` right before the cursor, if there is one. The @ must start a word. */
export function mentionBeforeCaret(text: string, caret: number): MentionMatch | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\w.-]{0,32})$/.exec(before);
  return m ? { start: before.length - m[2]!.length - 1, query: m[2]!.toLowerCase() } : null;
}

export type MentionChoice = { kind: "person"; person: ChatPerson } | { kind: "everyone" } | { kind: "here" };

/** Who the `@query` could mean: people whose name starts with it, then ones that contain it, then @everyone and @here. */
export function suggestMentions(
  people: ChatPerson[],
  meId: string,
  query: string,
  canPingAll: boolean,
  limit = 8,
): MentionChoice[] {
  const q = query.toLowerCase();
  const others = people.filter((p) => p._id !== meId);
  const starts = others.filter((p) => p.username.toLowerCase().startsWith(q));
  const contains = others.filter(
    (p) => !p.username.toLowerCase().startsWith(q) && p.username.toLowerCase().includes(q),
  );
  const all: MentionChoice[] = [
    ...starts.map((person) => ({ kind: "person" as const, person })),
    ...contains.map((person) => ({ kind: "person" as const, person })),
  ];
  if (canPingAll) {
    for (const word of ["everyone", "here"] as const) if (word.startsWith(q)) all.push({ kind: word });
  }
  return all.slice(0, limit);
}

/** The text to put in the box for a choice (without the @). */
export const mentionLabel = (choice: MentionChoice) =>
  choice.kind === "person" ? choice.person.username : choice.kind;

/** Swap each `@name` the person picked for its stored `<@id>`. A name they typed by hand is left as it is. */
export function mentionsToTokens(text: string, picked: ReadonlyMap<string, string>): string {
  let out = text;
  // Longest names first, so @sam doesn't eat the start of @samantha.
  for (const [name, id] of [...picked].sort((a, b) => b[0].length - a[0].length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`(^|\\s)@${escaped}(?![\\w.-])`, "g"),
      (_m, lead: string) => `${lead}${mentionToken(id)}`,
    );
  }
  return out;
}

/** The reverse, for editing: each `<@id>` becomes `@name`, and the names found are returned so they can be sent back. */
export function tokensToMentions(
  body: string,
  nameOf: (id: string) => string | undefined,
): { text: string; picked: Map<string, string> } {
  const picked = new Map<string, string>();
  const text = body.replace(MENTION_TOKEN, (token, id: string) => {
    const name = nameOf(id);
    if (!name) return token;
    picked.set(name, id);
    return `@${name}`;
  });
  return { text, picked };
}
