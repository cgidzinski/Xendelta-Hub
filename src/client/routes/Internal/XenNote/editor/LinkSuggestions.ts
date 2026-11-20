import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";

/** One line of the menu that opens after "[[" (pages) or "#" (tags). */
export type LinkItem =
  | { kind: "page"; id: string; title: string; subtitle: string; alias: string | null }
  | { kind: "note"; id: string; title: string }
  | { kind: "create"; title: string }
  | { kind: "tag"; tag: string }
  | { kind: "newtag"; tag: string };

export interface LinkMenuState {
  items: LinkItem[];
  rect: DOMRect | null;
  select: (item: LinkItem) => void;
}

export interface LinkSuggestionOptions {
  onState: (state: LinkMenuState | null) => void;
  /** Offered every key press while the menu is open; answers true when the menu used it. */
  onKey: (event: KeyboardEvent) => boolean;
  /** The lines for what has been typed so far. */
  load: (query: string) => Promise<LinkItem[]> | LinkItem[];
  /** Put the chosen line into the text, replacing what was typed (`range`). */
  choose: (editor: Editor, range: Range, item: LinkItem) => void;
}

const defaults = (): LinkSuggestionOptions => ({
  onState: () => undefined,
  onKey: () => false,
  load: () => [],
  choose: () => undefined,
});

function build(name: string, char: string, allowSpaces: boolean, allowedPrefixes: string[] | null) {
  return Extension.create<LinkSuggestionOptions>({
    name,
    addOptions: defaults,
    addProseMirrorPlugins() {
      const options = this.options;
      return [
        Suggestion<LinkItem, LinkItem>({
          editor: this.editor,
          pluginKey: new PluginKey(name),
          char,
          allowSpaces,
          allowedPrefixes,
          items: ({ query }) => options.load(query),
          command: ({ editor, range, props }) => options.choose(editor, range, props),
          render: () => {
            const publish = (p: SuggestionProps<LinkItem, LinkItem>) =>
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
}

/** "[[" opens the pages to link to (a title can have spaces, so the search goes on through them). */
export const WikiLinkSuggestion = build("wikiLinkSuggestion", "[[", true, null);
/** "#" at the start of a word opens the tags in use. */
export const HashtagSuggestion = build("hashtagSuggestion", "#", false, [" "]);
