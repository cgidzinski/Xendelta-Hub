/**
 * Voice and video calls are designed into the chat UI (the buttons, the thread layout) but not built. Flip this when the
 * call feature exists; until then the call buttons stay hidden.
 */
export const CHAT_CALLS_ENABLED = false;

/** The reactions offered on a message. Any emoji works through the API; these are the quick ones. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "🙏"] as const;
