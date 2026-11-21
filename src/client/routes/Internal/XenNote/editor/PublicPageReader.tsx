import { useMemo, useState } from "react";
import { Box } from "@mui/material";
import { EditorContent, useEditor } from "@tiptap/react";
import { createPageExtensions } from "@shared/xennote/pageSchema";
import ImageLightbox from "../../../../components/ui/ImageLightbox";
import type { PublicPage } from "../../../../types/XenNotePage";
import { editorSx } from "./editorSx";
import {
  BookmarkWithView,
  FileBlockWithView,
  ImageBlockWithView,
  PageFilesContext,
  WikiLinkWithView,
} from "./nodeViews";
import { PageLinksContext, PublicPageLinksContext, type PageLinksValue } from "./pageLinksContext";

const nodeViews = new Map(
  [ImageBlockWithView, FileBlockWithView, BookmarkWithView, WikiLinkWithView].map((node) => [node.name, node]),
);

export default function PublicPageReader({
  detail,
  titles,
  onOpenPage,
}: {
  detail: PublicPage;
  titles: ReadonlyMap<string, string>;
  onOpenPage: (id: string) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const extensions = useMemo(
    () => createPageExtensions().map((extension) => nodeViews.get(extension.name) ?? extension),
    [],
  );
  const editor = useEditor({ extensions, content: detail.doc, editable: false, immediatelyRender: false });
  const links: PageLinksValue = {
    notebookId: null,
    onOpenPage,
    onOpenTag: () => undefined,
    onCreatePage: async () => null,
    tags: () => [],
  };
  return (
    <PublicPageLinksContext.Provider value={titles}>
      <PageLinksContext.Provider value={links}>
        <PageFilesContext.Provider value={{ files: detail.files, onOpenImage: setImage }}>
          <Box sx={editorSx}>
            <EditorContent editor={editor} />
          </Box>
          {image && <ImageLightbox url={image} onClose={() => setImage(null)} />}
        </PageFilesContext.Provider>
      </PageLinksContext.Provider>
    </PublicPageLinksContext.Provider>
  );
}
