// Mentioning people in a message. Someone is written `<@userId>` in the stored body (the screen shows `@name`), and
// `@everyone` and `@here` are plain words. Anything inside code doesn't count, so quoting a mention doesn't ping anyone.

export const MENTION_TOKEN = /<@([a-f0-9]{24})>/g;

/** The body with its code (blocks and inline) blanked out. */
const withoutCode = (body: string) => body.replace(/```[\s\S]*?```|`[^`\n]*`/g, " ");

export const mentionToken = (userId: string) => `<@${userId}>`;

/** The people a body mentions, once each. */
export function extractMentionIds(body: string): string[] {
  return [...new Set([...withoutCode(body).matchAll(MENTION_TOKEN)].map((m) => m[1]!))];
}

export const mentionsEveryone = (body: string) => /(^|\s)@everyone(?!\w)/.test(withoutCode(body));
export const mentionsHere = (body: string) => /(^|\s)@here(?!\w)/.test(withoutCode(body));
