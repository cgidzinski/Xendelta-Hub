import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { filterSlashItems, type SlashItem, type SlashItemId } from "./slashItems";

/** What the menu needs to draw itself: the matching blocks, where the caret is, and how to choose one. */
export interface SlashState {
  items: SlashItem[];
  rect: DOMRect | null;
  select: (item: SlashItem) => void;
}

export interface SlashOptions {
  /** Told whenever the menu should show (a state) or go away (null). */
  onState: (state: SlashState | null) => void;
  /**
   * Offered every key press while the menu is open; answers true when the menu used it. (A function, not a ref object:
   * TipTap copies plain objects in `configure`, so a ref would be cloned and the menu would write to the original.)
   */
  onKey: (event: KeyboardEvent) => boolean;
  run: (id: SlashItemId, editor: Editor, range: Range) => void;
}

/**
 * Typing "/" at the start of a line, or after a space, opens a menu of blocks. The menu itself is a React component
 * (SlashMenu.tsx); this extension only finds the "/query" and reports it.
 */
export const SlashCommand = Extension.create<SlashOptions>({
  name: "slashCommand",

  addOptions() {
    return { onState: () => undefined, onKey: () => false, run: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => options.run(props.id, editor, range),
        render: () => {
          const publish = (p: SuggestionProps<SlashItem, SlashItem>) =>
            options.onState({ items: p.items, rect: p.clientRect?.() ?? null, select: (item) => p.command(item) });
          return {
            onStart: publish,
            onUpdate: publish,
            onKeyDown: ({ event }: SuggestionKeyDownProps) => options.onKey(event),
            onExit: () => options.onState(null),
          };
        },
      }),
    ];
  },
});
